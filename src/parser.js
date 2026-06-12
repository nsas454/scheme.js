// parser.js — Tokenizer / parse
Tokenizer = function (code) {
	this.point = 0;
	this.code = code;
	this.current = null;
	this.next();
};

Tokenizer.prototype.value = function () {
	return this.current;
};

// #; の次の 1 つの datum を読み飛ばし、続くトークン先頭の位置を返す
Tokenizer.prototype.skip_datum = function (start) {
	var sub = new Tokenizer(this.code.slice(start));
	if (sub.value() === '' || sub.value() == null) return start;
	parse(sub);
	return start + sub.tokenStart;
};

Tokenizer.prototype.next = function () {
	var inQuote = false;
	var token = "";
	// 先頭の空白・コメントを読み飛ばす(; / #|...|# / #;datum)
	while (this.point < this.code.length) {
		var wc = this.code.charAt(this.point);
		if (wc === ' ' || wc === '\n' || wc === '\t' || wc === '\r') {
			this.point++;
			continue;
		}
		if (wc === ';') {
			while (this.point < this.code.length && this.code.charAt(this.point) !== '\n') this.point++;
			continue;
		}
		if (wc === '#' && this.point + 1 < this.code.length) {
			var nc = this.code.charAt(this.point + 1);
			if (nc === '|') {
				this.point += 2;
				while (this.point + 1 < this.code.length) {
					if (this.code.charAt(this.point) === '|' && this.code.charAt(this.point + 1) === '#') {
						this.point += 2;
						break;
					}
					this.point++;
				}
				continue;
			}
			if (nc === ';') {
				this.point += 2;
				this.point = this.skip_datum(this.point);
				continue;
			}
		}
		break;
	}
	// read 用: このトークンの開始位置(空白/コメント除去後)を記録
	this.tokenStart = this.point;
	loop:
	for (var i = this.point; i < this.code.length; i++) {
		var c = this.code.charAt(i);

		switch (c) {
			case ";":
				// 文字列外の ; は行コメント開始。現在のトークンで区切る。
				if (inQuote) { token += c; break; }
				break loop;
			case "\"":
				inQuote = !inQuote;
				token += c;
				break;
			case "(":
			case ")":
			case "'":
			case "`":
				// 文字列内なら通常の文字として扱う(括弧やクォートを含む文字列を壊さない)
				if (inQuote) {
					token += c;
					break;
				}
				if (token.length > 0)
					break loop;
				i++;
				token = c;
				break loop;
			case ",":
				// 文字列内ならただの文字
				if (inQuote) {
					token += c;
					break;
				}
				if (token.length > 0)
					break loop;
				// ,@ (unquote-splicing) か , (unquote) か
				if (this.code.charAt(i + 1) === "@") {
					i += 2;
					token = ",@";
					break loop;
				}
				i++;
				token = c;
				break loop;
			case " ":
			case "\n":
				while (!inQuote && this.code.charAt(i++) in { "\n": 0, " ": 0 })
					break loop;
			default:
				token += c;
		}
	}
	this.point = i;
	this.current = token;

	// #t / #f : 真偽値リテラル
	if (token === "#t" || token === "#true") {
		return this.current = true;
	}
	if (token === "#f" || token === "#false") {
		return this.current = false;
	}
	// #\x : 文字リテラル (#\a #\space #\newline ...)
	if (token.length >= 3 && token.charAt(0) === "#" && token.charAt(1) === "\\") {
		return this.current = char_from_token(token);
	}

	// 数値(整数・有理数・小数・基数/正確さ接頭辞)
	var parsedNum = parse_number(token);
	if (parsedNum !== null) {
		return this.current = parsedNum;
	}
	//symbolのチェック
	if (is_Symbol(token)) {
		return this.current = new Symbol(token);

	}

	return token;
};

// "#\a" / "#\space" などを Char に変換する
char_from_token = function (token) {
	var name = token.slice(2);
	var named = {
		'space': ' ', 'newline': '\n', 'tab': '\t', 'return': '\r',
		'nul': '\0', 'null': '\0', 'delete': '\u007f', 'rubout': '\u007f',
		'altmode': '\u001b', 'escape': '\u001b', 'backspace': '\b', 'page': '\f',
		'linefeed': '\n'
	};
	if (named[name.toLowerCase()] !== undefined) {
		return new Char(named[name.toLowerCase()]);
	}
	return new Char(name.charAt(0));
};
// シンボルはインターン(名前ごとに一意のインスタンス)する。
// これにより (eq? 'a 'a) や memq/assq がシンボルでも正しく動作する。
var SYMBOL_TABLE = {};
function Symbol(str) {
	var existing = SYMBOL_TABLE[str];
	if (existing) return existing;
	this.tag = TAG_SYMBOL;
	this.name = str;
	SYMBOL_TABLE[str] = this;
}
is_Number = function (token) {
	if (token === "") return false;
	if (!isNaN(Number(token))) {
		return true;
	}
};
is_Symbol = function (token) {
	if (isNaN(Number(token))) {
		if (token.match(new RegExp("\"")) != null) {
			return false;
		}
	} else {
		return false;
	}

	//特殊記号のぞく
	//()
	//'はテキスト
	if (atom[token]) {
		return false;
	}
	return true;
};
atom = {
	"(": true,
	")": true,
	"'": true,
	"define": true,
	"define-macro": true,
	"define-syntax": true,
	"syntax-rules": true,
	"let-syntax": true,
	"letrec-syntax": true,
	"set!": true,
	"lambda": true,
	"begin": true,
	"cond": true,
	"if": true,
	"else": true,
	"quote": true,
	"let": true,
	"let*": true,
	"letrec": true,
	"do": true,
	"and": true,
	"or": true,
	"case": true,
	"delay": true,
	"define-library": true,
	"import": true,
	"export": true,
	"case-lambda": true,
	"define-values": true,
	"let-values": true,
	"let*-values": true,
	"cond-expand": true,
	"guard": true,
	"define-record-type": true,
	"include": true,
	"include-ci": true,
	"=>": true,
	"`": true,
	",": true,
	",@": true
};

// ドット対の区切り '.' か?(単独のドットのみ。1.5 等の数値は parse_number 済み)
function is_dot_token(v) {
	return v === '.' || (v instanceof Symbol && v.name === '.');
}

parse = function (tokenizer) {

	var ret;
	if (tokenizer.value() == "(") {
		if (tokenizer.next() == ")") {
			tokenizer.next();
			ret = null;
		} else {
			var elems = [];
			var dottedTail = null;
			var dotted = false;
			// 厳密比較を使う: 数値 0 は loose比較だと 0 == "" が真になり要素が脱落する
			while (tokenizer.value() !== "" && tokenizer.value() !== ")") {
				// ドット対 (a b . c): '.' の後ろの 1 要素が cdr(末尾)になる
				if (is_dot_token(tokenizer.value())) {
					tokenizer.next();
					dottedTail = parse(tokenizer);
					dotted = true;
					break;
				}
				elems[elems.length] = parse(tokenizer);
			}
			if (tokenizer.value() == ")")
				tokenizer.next();
			if (dotted) {
				// 不完全リストを本物の Pair で構築して返す(引用データ用)
				var lst = dottedTail;
				for (var di = elems.length - 1; di >= 0; di--) lst = new Pair(elems[di], lst);
				ret = lst;
			} else {
				ret = elems;
			}
		}
	} else if (tokenizer.value() == "\'") {
		tokenizer.next();
		ret = ["quote", parse(tokenizer)];
	} else if (tokenizer.value() == "`") {
		tokenizer.next();
		ret = ["quasiquote", parse(tokenizer)];
	} else if (tokenizer.value() == ",") {
		tokenizer.next();
		ret = ["unquote", parse(tokenizer)];
	} else if (tokenizer.value() == ",@") {
		tokenizer.next();
		ret = ["unquote-splicing", parse(tokenizer)];
	} else {
		ret = tokenizer.value();

		tokenizer.next();
	}
	return ret;
};
