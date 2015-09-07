# scheme.js
schemeインタプリタ.JavaScriptで実装したSchemeのインタプリタです.
scheme処理系をJavaScriptで実装しました。
基本的な構文には対応していますが、マクロ、継続、クロージャーにはまだ完全に対応していません。

# 使い方

HTMLの中で*schemInp.js*を読み込んでください
```
<script type="text/javascript" src="schemInp.js"></script>
```

以下のコマンで実行してください
JavaScriptの関数として実行してもらえれば大丈夫です。
```
scheme("code");
```
