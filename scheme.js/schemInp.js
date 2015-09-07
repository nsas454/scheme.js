/**
 * Scheme interpriter in JavaScript
 * Copyright (c) [2014] [Shuichi Yukimoto]
 * This software is released under the MIT License.
 *
 * https://bitbucket.org/yukimoto/scheme.js
 *
 * @fileoverview scheme in JavaScript
 * @author yukimoto@usa-mimi.jp
 */

//TODO
//関数はシンボルではない！
//symbol? ->#t
//cons
//length ->リストの要素数
//append リストの結合
//quote
//構文 #t と #f はTrueとFalseを表し、チェックする述語は boolean? 
//「(quasiquote (foo bar))」 で「`(foo bar)」、「(unquote a)」で「,a」、「(unquote-splicing a)」で「,@a」

var _callback_=function(readystatechange) {
		  if (readystatechange.target.readyState == 4) { // DONE
		    if (readystatechange.target.status == 200) { // OK
		      return regist_global('*callback*',readystatechange.target.responseText);
		    } else {
		      return regist_global('*callback*',readystatechange.target.responseText);
		    } 
		  }
		};
	
//クロスドメイン通信ができるJsonpも実装する

var NUMBER="number";
var STRING="string";
//var SYMBOL=1;
var TAG_CONS = 0;
var TAG_SYMBOL = 1;
var TAG_NUM = 2;
//baseの関数
//carとcdrの実装
//TODO:エラー処理

var car=function(list){
	return list[0];
}
var cdr = function(list){
	return list.slice(1);
}
var cadr=function(list){
	return cdr(car(list));
}

var cons=function(argv1,argv2){
	if(arguments.length !=2)
		throw("cons requies 2 arguments");
	var ret =[];
	ret.push(argv1);
	ret.push(argv2);
return ret;
};

var isNumber = function(value){
    if(typeof(value) != 'number' && typeof(value) != 'string' )
        return false;
    else
        return (value == parseFloat(value) && isFinite(value));
}

var primitive_procedures={
    'car':car,
    'cdr':cdr,
    '*':function(){
      	 var ret = 1;
      	 for( var i=0; i<arguments[0].length; i++){
          	 if( !isNumber(arguments[0][i]) )
           		throw("arguments["+i+"] is NaN."+arguments[0][i]);
          		 else
              	 ret *= (arguments[0][i]);
   		 }
      		  return ret;

    },
    '+':function(){
   	 var ret = 0;
   	 for( var i=0; i<arguments[0].length; i++){
       	 if( !isNumber(arguments[0][i]) )
        		throw("arguments["+i+"] is NaN."+arguments[0][i]);
       		 else
           	 ret += (+arguments[0][i]);
		 }
   		  return ret;
	}
	,
    '-':function(){
    	if( !isNumber(arguments[0][0]) )
      	  throw("arguments[0] is NaN."+arguments[0][0]);

   	   	var ret = arguments[0][0];
   	 	for( var i=1; i<arguments[0].length; i++){
        	if( !isNumber(arguments[0][i]) )
           	 throw("arguments["+i+"] is NaN."+arguments[i]);
        	 else
            	ret -= (+arguments[0][i]);

    			return ret;
			}
		},
    '/':function(){
		
    	if( !isNumber(arguments[0][0]) )
        	throw("arguments[0] is NaN."+arguments[0][0]);

   		 var ret = arguments[0][0];
    	 for( var i=1; i<arguments[0].length; i++)
        	if( !isNumber(arguments[0][i]) )
           	 throw("arguments[0]["+i+"] is NaN."+arguments[0][i]);
        	else
            	ret /= arguments[0][i];

    			return ret;
			},
	'eq?':function(){
		if(arguments[0].length !=2){
			error("'eq? ' requires 2 arguments.");
		}
		return (arguments[0][0]==arguments[0][1]);
		
		},
	'display':function(){
		for (var i = 0; i < arguments[0].length; i ++) {
			return console.log(arguments[0][i]);
		}
	},
	'XHR':function(){
		if(arguments[0].length < 2){
			error("'XHR ' requires 2 arguments. method,url");
		}
		var METHOD=arguments[0][0].replace(/\"/g,'');
		var URL=arguments[0][1].replace(/\"/g,'');
		var body=null;
		
		if(URL=='POST'){
			body =arguments[0][2];
		}
		
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = _callback_;
		xhr.open(METHOD,URL,true);
		xhr.send(body);
	}
		};


var isprimitive_procedure=function(procedure){
    return istagged_list(procedure,"primitive");
};


//var Symbol_list ={};

function Symbol(str) {
    this.tag = SYMBOL;
    this.name = str;
}

//シンボルの削除をする時！
//delete Symbol.symbols["aaaa"]
isSymbol=function(exp){
	if(exp instanceof Symbol){ 
		return true;
	}
	return false;
};

//
self_evaluating=function(exp){
	
	if(exp == parseFloat(exp) && isFinite(exp)) return true;
	if(typeof(exp)==STRING
		&&exp.charAt(0)=="\""
		&&exp.charAt(exp.length-1)=="\"") return true;
	return false;
};
isVariable=function(exp){
	return exp instanceof Symbol;
}

var Globale={};

regist_global=function(name,value){
    Globale[name]=value;
}

var Env=function(){
	this.envs={};
	this.genvslist=Globale;
	this.find=function(arg){
	    if(this.envs[arg.name]==null){
			var ret = this.genvslist[arg.name];
			if(ret == null){
		    	return error(arg.name+'is not defined');
			}
			return ret;
	    }
	   	 return this.envs[arg.name];
	};
    this.assainment=function(arg1,arg2){
		var ret =this.genvslist[arg1];
		if(ret == null) {
			return this.envs[arg1]=arg2;
		}else{
			return this.genvslist[arg1]=arg2;
		}
		
		
    	};
    this.add=function(exp,value){
		//Symbol(exp);
		this.envs[exp]=value;
		return this.envs[exp];
	};
};

extend_env=function(parameters, args, env){
	var alist={};
	if(parameters == null){
		return env;
	}
	for (var i = 0; i < parameters.length; i ++) {
		if(isSymbol(parameters[i])){
			alist[parameters[i].name]=args[i];
		}else{
			alist[parameters[i]]=args[i];
		}
		
	}
	for (var item in alist) {
		env.add(item,alist[item]);
	}

	return env;
};

enclosing_environment=function(env){
	return cdr(env);
};
first_fream=function(env){
	return car(env);
};
the_empty_environment ="()";

make_frame=function(variables,values){
	return cons(variables ,values);
};
frame_variables=function (frame){
	return car(frame);
};

frame_values=function(frame){
 	return cdr(frame);
 };

look_up_variable_value=function(arg,env){
	return env.find(arg);
};

//;;;; クォート式は (quote <text-of-quotation>) の形
isquoted=function(exp){
	return istagged_list(exp,"quote");
};


text_of_quotation=function(exp){
	if(car(cdr(exp)) instanceof Array){
		return car(cdr(exp))
	}
	if(car(cdr(exp)) instanceof Symbol){
		return car(cdr(exp)).name;
	}
	return car(cdr(exp)).replace(/\"/g,'');
}

istagged_list=function(exp,tag){
	if(exp instanceof Array){
		if(car(exp) == tag){
			return true;
		}
		return false;
	}
}

isassignment=function(exp){
	return istagged_list(exp,'set!');
};

eval_assignment=function(exp,env){
    return env.assainment(car(cdr(exp)).name,car(cdr(cdr(exp))));

};

isdefine =function(exp){

    return istagged_list(exp,'define');
};

//TODO:lambda式の修正が必要？？
eval_definition=function(exp,env){
    if(car(cdr(exp)) instanceof Array){
		var param = cdr(car(cdr(exp)));
		var name=car(car(cdr(exp))).name;
		var lambda = ['lambda',param,cdr(cdr(exp)),env];
		regist_global(name,lambda);
    }else{
	regist_global(car(cdr(exp)).name,scheme_eval(car(cdr(cdr(exp))),env));
}
    return car(cdr(exp)).name;
};

isif=function(exp){
    return istagged_list(exp, "if");
};

eval_if=function(exp,env){
    if(scheme_eval(car(cdr(exp)),env)){
		return scheme_eval(car(cdr(cdr(exp))),env);
    }else{
		return scheme_eval(car(cdr(cdr(cdr(exp)))),env);
    }
};


islambda=function(exp){
    return istagged_list(exp, "lambda");
};

make_procedure=function(param,body,env){
    var rtn=[];
    rtn.push("procedure");
    rtn.push(param);
    rtn.push(body);
    rtn.push(env);
    return rtn;
};

lambda_parameters=function(exp){
    return car(cdr(exp));
};
lambda_body=function(exp){
    return car(cdr(cdr(exp)));
};

first_exp =function(seq) {
	if(car(seq) instanceof Array){ 
		return car(seq);
	}else{
		return seq;
	}
	
};
rest_exps = function(seq){
    return cdr(seq);
};


primitive_implementation =function(proc){
    return car(cdr(proc));
};

apply_primitive_procedure=function(proc ,args){
	var func=car(cdr(proc));
	return func.call(this,args);
};

operator=function(exp){
	return car(exp);
};

isapplication=function(exp){
	if(exp instanceof Array){
	  return true;
	}else{
		return false;
	}
};

islast_exp=function(exp){
	   
	   if(car(cdr(exp)) instanceof Array){  
		 return false
	   }else{  
		 return true 
	   }
	   
};

eval_sequence=function(exps,env){
    if(islast_exp(exps)){
		return scheme_eval(first_exp(exps),env);
    }else{	

		scheme_eval(first_exp(exps),env);
		return eval_sequence(rest_exps(exps),env);
    }
};

operands=function(exp){
	return cdr(exp);
};
eval_list=function(exp,env){
	var ret=[];
	exp.map(function(x){
		ret.push(scheme_eval(x,env));
	});
	return ret;
};
//TODO!!
lambda_apply=function(closure,args){
	var ret,parameters, body, env;
	ret= closure_to_parameters_body_env(closure);
	parameters=ret[0];
	body=ret[1];
	env=ret[2];
	if(env == undefined){
	    env = new Env();
	}
	new_env = extend_env(parameters, args, env);
	return scheme_eval(body,new_env);

}

closure_to_parameters_body_env=function(closure){
	var ret=closure;
	if(closure instanceof Array){
	    ret=[closure[1],closure[2],closure[3]];
	}
	return ret;
}
iscompound_procedure=function(p){
	return istagged_list(p,"procedure");
}
procedure_parameters=function(p){
	return car(cdr(p));
}
procedure_body=function(p){
	return car(cdr(cdr(p)));
}

procedure_environment=function(p){
	
	return car(cdr(cdr(cdr(p))));
}

//closureで分ける
function s_apply(procedure, arguments){
    if(isprimitive_procedure(procedure)){
		return apply_primitive_procedure(procedure,arguments);
    }
	if(iscompound_procedure(procedure)){
		return eval_sequence(
			procedure_body(procedure),
			extend_env(
				procedure_parameters(procedure),
				arguments,
				procedure_environment(procedure)
			));
	}else{
		return lambda_apply(procedure, arguments);
   } 
};

isbegin=function(exp){
	return istagged_list(exp,"begin");
};
begin_actions=function(exp){
	return cdr(exp);
};

iscond=function(exp){
	return istagged_list(exp,"cond");
};
islet=function(exp){
	return istagged_list(exp,"let");
};

cond_if=function(exp){
	return expand_clauses(cond_clauses(exp));
};

cond_else_clause=function(clause){
	 return cond_predicate(clause) == "else";
 };

cond_predicate=function(clause){
	 return car(clause);
 };
 
sequence_exp=function(seq){
	if(seq==null) return seq;
	if(islast_exp(seq))return first_exp(seq);
	return make_begin(seq);
};	

make_begin=function(seq){
	var ret = []
	ret.push('begin');
	ret.push(seq)
	return ret;
};

make_if=function(predicate ,consequent ,alternative){
	var ret=[];
	ret.push("if");
	ret.push(predicate);
	ret.push(consequent);
	ret.push(alternative);
	return ret;
};
expand_clauses=function(clauses){
	if(clauses == false )　return false;
	//#fを返すような実装にする
	var first = car(clauses);
	var rest =cdr(clauses);
	if(cond_else_clause(first)){
		if(rest==false){
			
			return sequence_exp(cond_actions(first));
		}else{
			return error("ELSE clause isn't last -- COND->IF")
		}
	}else{
		return make_if(cond_predicate(first),
			sequence_exp(cond_actions(first)),
			expand_clauses(rest));
	}
};
cond_actions=function(clause){
	return car(cdr(clause));
};
cond_clauses=function(exp){
	return cdr(exp);
};
show_text=function(exp){
	var ret=exp;
	if(isNaN(Number(exp))){
		ret=exp.replace(/\"/g,"");
	}
	return ret;
}

eval_let=function(exp,env){
	var param_list= let_to_parameters_args_body(exp);
	var arg =param_list[1];
	new_exp = [['lambda', param_list[0], param_list[2]]]; 
	for (var i = 0; i < arg.length; i ++) {
		new_exp.push(car(arg[i]));
	}	
	return scheme_eval(new_exp, env)
}

 let_to_parameters_args_body=function(exp){
 	var ret=[];
 	var param = [];
	var arg=[];
	var array = car(cdr(exp))
	var body =car(cdr(cdr(exp)))
	for (var i = 0; i < array.length; i ++) {
	  param.push(car(array[i]));
	  arg.push(cdr(array[i]));
	}
	ret.push(param);
	ret.push(arg);
	ret.push(body)
 	return ret;
 }
scheme_eval=function(sexp,env){
	if(env == undefined){
    	env = new Env();
}
//自己評価式
if (self_evaluating(sexp)){
	return show_text(sexp);
}
//定数リテラル
if(isVariable(sexp)){
	return look_up_variable_value(sexp,env);
}
//quote exp
if(isquoted(sexp)){
	return text_of_quotation(sexp);
}
//assainment
//TODO:test!!
if(isassignment(sexp)){
	return eval_assignment(sexp, env);
}
//define
if(isdefine(sexp)){
    return eval_definition(sexp,env);
}
//let
if(islet(sexp)){
	return eval_let(sexp,env);
}
//if test conseq alt
if(isif(sexp)){
    return eval_if(sexp,env);
}
//lambda
 if(islambda(sexp)){
     return make_procedure(
	 			lambda_parameters(sexp),
	 		   	lambda_body(sexp)
	 		   ,env);
 }
 //begin
if(isbegin(sexp)){
	return eval_sequence(begin_actions(sexp),env);
}

//cond
if(iscond(sexp)){
	return scheme_eval(cond_if(sexp),env);
}      

if(isapplication(sexp)){
    return s_apply(
		scheme_eval(
	    	operator(sexp),env),
			eval_list(operands(sexp), env)
    	);
}

return  error("Unknown expression type -- EVAL");
};

error=function(error){
    throw error;
};


(function(){
	for (var i in primitive_procedures) {
		regist_global(i,["primitive",primitive_procedures[i]]);
	}
})();


/** 
 * parser
 * S式をリストにしてevalする
 *
 */

scheme = function(code){
	var tokenizer = new Tokenizer(code);
	var tree = parse( tokenizer );
	var result = null;
try{
	result = scheme_eval(tree);

} catch( e ) {
	result = e;
}
return  result;
}

Tokenizer = function(code){
	this.point = 0;
	this.code = code;
	this.current = null;
	this.next();
};

Tokenizer.prototype.value = function(){
	return this.current;
};

Tokenizer.prototype.next = function(){
	var inQuote = false;
	var token = "";
	while( this.code.charAt(this.point) in { "\n":0, " ":0 } ){
		this.point++;
	}
	loop:
	for( var i=this.point; i<this.code.length; i++ ){
		var c = this.code.charAt(i);
		
		switch(c) {
		case "\"":
			inQuote = !inQuote;
			token += c;
			break;
		case "(":
		case ")":
		case "'":
			if( token.length > 0 )
			break loop;
			i++;
			if(inQuote){
				token += c;
				break;
			}else{
				token = c;
					break loop;
				}
		case " ":
		case "\n":
				while( !inQuote && this.code.charAt(i++) in { "\n":0, " ":0 } )
				break loop;
		default:
				token += c;
			}
		}
		this.point = i;
		this.current = token;
		
		//symbolのチェック
		if(is_Number(token)){
			this.current=Number(token);
		}
		if(is_Symbol(token)){
			return this.current  = new Symbol(token);
			
		}
		
		return token;
	};
function Symbol(str) {
	this.tag = TAG_SYMBOL;
	this.name = str;
}
is_Number=function(token){
	if(!isNaN(Number(token))){
		return true;
	}
};	
is_Symbol=function(token){
	if(isNaN(Number(token))){
		if(token.match(new RegExp("\""))!=null){
			return false;
		}
	}else{
		return false;
	}
	
	//特殊記号のぞく
	//()
	//'はテキスト
	if(atom[token]){
		return false;
	}
	return true;
};
atom={
	"(":true,
	")":true,
	"define":true,
	"set!":true,
	"lambda":true,
	"begin":true,
	"cond":true,
	"if":true,
	"else":true,
	"quote":true,
	"let":true
};

parse = function(tokenizer){

	var ret;
	if( tokenizer.value() == "(" ){
		if( tokenizer.next() == ")" ){
			tokenizer.next();
			ret = null;
		}else{
			ret = new Array();
			while( tokenizer.value() != "" && (tokenizer.value() != ")")) {
				ret[ret.length] = parse(tokenizer);
			}
			if( tokenizer.value() == ")" )
			tokenizer.next();
		}
	}else if(tokenizer.value() == "\'"){
		tokenizer.next();
		ret = [ "quote", parse(tokenizer) ];
	} else  {
		ret = tokenizer.value();
		
		tokenizer.next();
	}
	return ret;
};
