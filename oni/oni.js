// Copyright (c) 2008-2009 Oni project contributors
//
// Contributors:
//   Alexander Fritze <alex@croczilla.com>
//
// Permission is hereby granted, free of charge, to any person
// obtaining a copy of this software and associated documentation
// files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use, copy,
// modify, merge, publish, distribute, sublicense, and/or sell copies
// of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
// BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// -------------------------------------------------------------------
//
// Oni v0.1
//
// An embedded structured concurrency language
// See http://www.croczilla.com/oni for details
//
// JavaScript-embedded version for web browsers
// Generated from oni.js.in.
//


(function () {


////////////////////////////////////////////////////////////////////////
// Helpers

 
// Binds a function to an object; the function will be executed with
// its 'this' variable set to 'obj':
function bind(f, obj) {
  return function() {
    return f.apply(obj, arguments);
  }
}

// create an array from a function's arguments object, starting at the
// i's parameter
function slice_args(a, /*[opt]*/ i) {
  return Array.prototype.slice.call(a, i);
}

// call 'fct' asynchronously
function callAsync(fct) {
  window.setTimeout(fct, 0);
}

function timeout(cont, duration_ms) {
  var id = window.setTimeout(function() { return cont([true, null]);}, duration_ms);
  return function() { window.clearTimeout(id); }
}



////////////////////////////////////////////////////////////////////////
// Oni expression graph structure

// XXX we want to store the expression graph in closures instead of
// objects, so that we can use '()' on general oni_exp's, and not just
// oni_fexp's.

// Oni expression node; this will be the root prototype for all nodes
function OEN() {}
OEN.prototype = { __isOEN : true };

function isOEN(e) {
  return e && (e.__isOEN == true);
}

// Oni appliable node; this will be the root prototype for nodes with
// an 'apply' method
function OAN() {}
OAN.prototype = new OEN();
OAN.prototype.__isOAN = true;

function isOAN(e) {
  return e && (e.__isOAN == true);
}

//----------------------------------------------------------------------
// Sequence node:
function OEN_Seq(exps) {
  this.children = exps;
}
OEN_Seq.prototype = new OEN();

//----------------------------------------------------------------------
// Alternation node:
function OEN_Alt(exps) {
  this.children = exps;
}
OEN_Alt.prototype = new OEN();

//----------------------------------------------------------------------
// Quote node:
function OEN_Quote(datum) {
  this.datum = datum;
}
OEN_Quote.prototype = new OEN();

//----------------------------------------------------------------------
// Apply node:
function OEN_Apply(fexp, args) {
    this.fexp = fexp;
    this.args = args;
}
OEN_Apply.prototype = new OEN();

//----------------------------------------------------------------------
// ALift node:
function OAN_ALift(async_f) {
    this.async_f = async_f;
}
OAN_ALift.prototype = new OAN();

//----------------------------------------------------------------------
// SLift node:
function OAN_SLift(sync_f) {
  this.sync_f = sync_f;
}
OAN_SLift.prototype = new OAN();

//----------------------------------------------------------------------
// Let node:
function OEN_Let(bindings, body_exp) {
  this.bindings = bindings;
  this.body_exp = body_exp;
}
OEN_Let.prototype = new OEN();

//----------------------------------------------------------------------
// Get node:
function OEN_Get(var_name) {
  this.var_name = var_name;
}
OEN_Get.prototype = new OEN();

//----------------------------------------------------------------------
// Closure node:
function OAN_Closure(formals, body_exp, env) {
  this.formals = formals;
  this.body_exp = body_exp;
  this.env = env;
}
OAN_Closure.prototype = new OAN();

//----------------------------------------------------------------------
// Lambda node:
function OEN_Lambda(formals, body_exp) {
  this.formals = formals;
  this.body_exp = body_exp;
}
OEN_Lambda.prototype = new OEN();

//----------------------------------------------------------------------
// Throw node:
function OEN_Throw(tag_exp, val_exp) {
  this.tag_exp = tag_exp;
  this.val_exp = val_exp;
}
OEN_Throw.prototype = new OEN();

//----------------------------------------------------------------------
// Catch node:
function OEN_Catch(tag_exp, body_exp, handler_exp) {
  this.tag_exp = tag_exp;
  this.body_exp = body_exp;
  this.handler_exp = handler_exp;
}
OEN_Catch.prototype = new OEN();

//----------------------------------------------------------------------
// If node:
function OEN_If(test_exp, consequent_exp, alternative_exp) {
  this.test_exp = test_exp;
  this.consequent_exp = consequent_exp;
  this.alternative_exp = alternative_exp;
}
OEN_If.prototype = new OEN();

////////////////////////////////////////////////////////////////////////
// Expression graph execution

//----------------------------------------------------------------------
// Oni execution context

// execute an expression with a new execution context:
function fork(env, next, expr) {
  var xc = {  next    : next,
              current : null
           };
  try {
    expr.execute(xc, env);
  }
  catch(e) {
    // dump("Exception forking "+expr+": "+e.stack+"n");
  }
  return xc;
}

//----------------------------------------------------------------------
// Oni exceptions
function OXX(tag, value) {
  this.tag = tag;
  this.value = value;
}
OXX.prototype = { __isOXX : true };

function isOniException(e) {
  return e && (e.__isOXX == true);
}

//----------------------------------------------------------------------
// Oni execution node; this will be root prototype for all execution
// node types
function OXN(classname) {
  this.oxn_classname = classname;
}
OXN.prototype = {
  __isOXN: true,
  toString: function() { return "OXN<"+this.oxn_classname+">"; }
};

//----------------------------------------------------------------------
// Seq execution node:
function OXN_Seq(exps, xc, env) {
  this.xc = xc;
  this.xc.current = this;
  this.env = env;
  
  this.exps = exps;
  
  // we're also the execution context for our subexecutions:
  this.next = this;
  this.current = null;
  
  this.i_exp = -1;
  this.exp_count = this.exps.length;
  this.cont(this, null);
}
OXN_Seq.prototype = new OXN("Seq");

OXN_Seq.prototype.cont = function(exiting_xc, rv) {
  if (isOniException(rv)) {
    this.xc.next.cont(this.xc, rv);
    return;
  }

  var i = ++this.i_exp;
  if (i >= this.exp_count) {
    // should only reach this for empty Seq's
    this.xc.next.cont(this.xc, rv);
    this.clear();
  }
  else if (i+1 == this.exp_count) {
    // tail call
    this.exps[i].execute(this.xc, this.env);
    this.clear();
  }
  else {
    // normal call
    this.exps[i].execute(this, this.env);
  }
};

OXN_Seq.prototype.abort = function() {
  if (this.current) {
    this.current.abort();
    this.clear();
  }
};

OXN_Seq.prototype.clear = function() {
  delete this.xc;
  delete this.env;
  delete this.current;
};

// bind to the seq expression node:
OEN_Seq.prototype.execute = function(xc, env) {
  return new OXN_Seq(this.children, xc, env);
};

//----------------------------------------------------------------------
// Alt execution node:
function OXN_Alt(exps, xc, env) {
  this.xc = xc;
  this.xc.current = this;
  
  this.forks = [];
  
  for (var i=0; i<exps.length; ++i) {
    this.forks.push(fork(env, this, exps[i]));
  }
}
OXN_Alt.prototype = new OXN("Alt");

OXN_Alt.prototype.cont = function(exiting_context, rv) {
  if (isOniException(rv)) {
    this.xc.next.cont(this.xc, rv);
    return;
  }

  for (var i=0; i<this.forks.length; ++i) {
    if (this.forks[i] != exiting_context)
      this.forks[i].current.abort();
  }
  this.xc.next.cont(this.xc, rv);
  this.clear();
};

OXN_Alt.prototype.abort = function() {
  if (this.forks) {
    for (var i=0; i<this.forks.length; ++i) {
      var f = this.forks[i];
      try {
        if (f.current) f.current.abort();
      }
      catch(ex) {
        // dump("Exception while aborting "+f.current+": "+ex.stack+"\n");
      }
    }
    this.clear();
  }
};

OXN_Alt.prototype.clear = function() {
  delete this.xc;
  delete this.forks;
};

// bind to the alt expression node:
OEN_Alt.prototype.execute = function(xc, env) {
  return new OXN_Alt(this.children, xc, env);
};

//----------------------------------------------------------------------
// Quote execution node:
function OXN_Quote(datum, xc) {
  this.xc = xc;
  this.xc.current = this;
  
  this.datum = datum;
  var cont = bind(this.cont, this);
  callAsync(cont);
}
OXN_Quote.prototype = new OXN("Quote");

OXN_Quote.prototype.cont = function() {
  if (!this.xc) return; // we've been aborted
  this.xc.next.cont(this.xc, this.datum);
  this.clear();
};

OXN_Quote.prototype.abort = function() {
  this.clear();
};

OXN_Quote.prototype.clear = function() {
  if (!this.xc) return;
  delete this.xc;
  delete this.datum;
};

// bind to quote expression node:
OEN_Quote.prototype.execute = function(xc, env) {
  return new OXN_Quote(this.datum, xc);
};

//----------------------------------------------------------------------
// Apply execution node:
function OXN_Apply(fexp, aexps, xc, env) {
  this.xc = xc;
  this.xc.current = this;
  this.env = env;
  
  this.fork_count = 1 + aexps.length;
  this.forks = [];
  this.forks.push(fork(env, this, fexp));
  
  for (var i=0; i<aexps.length; ++i) {
    this.forks.push(fork(env, this, aexps[i]));
    }
}
OXN_Apply.prototype = new OXN("Apply");

OXN_Apply.prototype.cont = function(exiting_context, rv) {
  if (isOniException(rv)) {
    this.xc.next.cont(this.xc, rv);
    return;
  }

  // replace context by result:
  for (var i=0; i<this.forks.length; ++i)
    if (this.forks[i] == exiting_context) {
      this.forks[i].current = null;
      this.forks[i].rv = rv;
      break;
    }
  // xxx assert that the context was found
  
  if (--this.fork_count == 0) {
    var oan = this.forks.shift().rv;
    // xxx with harmonization of oan's and oni_fexp's, this extra
    // resolution step will go away
    if (is_oni_fexp(oan)) {
      // xxx this will work for everything but Lambda's which would
      // require an extra closure-generation step.
      oan = oni_fexp_to_OEN(oan);
    }
    var pars = [];
    for (var i=0; i<this.forks.length; ++i) {
      pars.push(this.forks[i].rv);
    }
    
    // apply with parent context (tail call):
    oan.apply(this.xc, this.env, pars);
    this.clear();
  }
};

OXN_Apply.prototype.abort = function() {
  if (this.forks) {
    for (var i=0; i<this.forks.length; ++i) {
      if (this.forks[i].current)
        this.forks[i].current.abort();
    }
    this.clear();
  }
};

OXN_Apply.prototype.clear = function() {
  delete this.xc;
  delete this.env;
  delete this.forks;
};
  
// bind to the apply expression node:
OEN_Apply.prototype.execute = function(xc, env) {
  return new OXN_Apply(this.fexp, this.args, xc, env);
};

//----------------------------------------------------------------------
// ALift execution nodes:

// execution node for execute() calls:
// evaluate to self:
OAN_ALift.prototype.execute = function(xc, env) {
  return new OXN_Quote(this, xc);
};

// execution node for apply() calls:

// Calls the asynchronous js function 'async_f' which is
// expected to have the following signature:
//      abort_f async_f(cont, arg1, arg2, ...)
// - async_f must return an abort function 'abort_f' (can be null).
// - async_f must call 'cont' exactly 0 or 1 times, passing in a
//   return value structured in the following way:
//       [true, return_value]    : success, returning 'return_value'
//       [false, error_string]   : failure; oni will throw an exception
//                                 with tag "error" and value 'error_string'.
// - If Oni calls abort_f before async_f has called 'cont', any subsequent
//   call to 'cont' will be ignored. abort_f will be called exactly 0
//   or 1 times. abort_f will not be called after async_f has called 'cont'.
// - async_f will be executed with a 'this' object set to the current
//   environment.

function OXN_ALift_Apply(async_f, xc, env, args) {
  this.xc = xc;
  this.xc.current = this;
  
  var pars = [bind(this.cont, this)];
  pars = pars.concat(args);
  this.abort_f = async_f.apply(env, pars);
}
OXN_ALift_Apply.prototype = new OXN("ALift_Apply");

OXN_ALift_Apply.prototype.abort = function() {
  if (this.xc)
    delete this.xc;
  if (this.abort_f) {
    this.abort_f();
    delete this.abort_f;
  }
};

OXN_ALift_Apply.prototype.cont = function(rv) {
  if (!this.xc) return; // we've been aborted

  // map result to exception if appropriate:
  if (rv[0] == true)
    rv = rv[1];
  else
    rv = new OXX("error", rv[1]);
  
  this.xc.next.cont(this.xc, rv);
  delete this.xc;
  delete this.abort_f;
};

// bind to alift expression node:
OAN_ALift.prototype.apply = function(xc, env, args) {
  return new OXN_ALift_Apply(this.async_f, xc, env, args);
};

//----------------------------------------------------------------------
// SLift execution nodes:

// execution node for execute() calls:
// evaluate to self:
OAN_SLift.prototype.execute = function(xc, env) {
  return new OXN_Quote(this, xc);
};

// execution node for apply() calls:
// Calls the synchronous js function 'sync_f'. If sync_f throws an
// exception it will be converted into an Oni exception with label "error".
// Simple implementation in terms of ALift:
OAN_SLift.prototype.apply = function(xc, env, args) {
  var sync_f = this.sync_f;
  var async_f = function(/*cont, arg1, arg2, ... */) {
    var cont = arguments[0];
    var pars = slice_args(arguments, 1);
    // XXX not quite correct; sync_f might be called after abort
    // Should be ok though; ALift OXN prevents result from being published
    callAsync(function() { try { var rv = sync_f.apply(this, pars);
                                 cont([true, rv]);
                               }
                           catch (e) { cont([false, e]); }
                         });
  };
  return new OXN_ALift_Apply(async_f, xc, env, args);
};

//----------------------------------------------------------------------
// Let execution node:

function OXN_Let(bindings, body_exp, xc, env) {
  this.xc = xc;
  this.xc.current = this;
  // bindings' value expressions will be executed in the new
  // environment, to support (mutual) recursion from closures:
  // XXX don't have __proto__ in IE
  //this.env = {};
  //this.env.__proto__ = env;
  function Env() {}
  Env.prototype = this.env;
  this.env = new Env();
  
  this.body_exp = body_exp;
  
  // xxx this code is not reentrant. bindings' expressions must be async.
  this.fork_count = 0;
  this.forks = [];
  for (b in bindings) {
    ++this.fork_count;
    this.forks.push([b, fork(this.env, this, bindings[b])]);
  }   
}
OXN_Let.prototype = new OXN("Let");

OXN_Let.prototype.cont = function(exiting_context, rv) {
  if (isOniException(rv)) {
    this.xc.next.cont(this.xc, rv);
    return;
  }

  // insert value into environment; clear context:
  for (var i=0; i<this.forks.length; ++i) {
    if (this.forks[i][1] == exiting_context) {
      this.env[this.forks[i][0]] = rv;
      this.forks[i][1].current = null;
      break;
    }
  }
  // xxx assert that context was found

  if (--this.fork_count == 0) {
    // value_exp has finished; now call body_exp with the new bindings &
    // the parent's xc (tail call):
    this.body_exp.execute(this.xc, this.env);
    this.clear();
  }
};

OXN_Let.prototype.abort = function() {
  if (this.forks) {
    for (var i=0; i<this.forks.length; ++i) {
      if (this.forks[i][1].current)
        this.forks[i][1].current.abort();
    }
    this.clear();
  }
};

OXN_Let.prototype.clear = function() {
  delete this.xc;
  delete this.env;
  delete this.forks;
};

// bind to Let expression node:
OEN_Let.prototype.execute = function(xc, env) {
  return new OXN_Let(this.bindings, this.body_exp, xc, env);
}

//----------------------------------------------------------------------
// Get execution node:
function OXN_Get(var_name, xc, env) {
  this.xc = xc;
  this.xc.current = this;
  this.env = env;
  
  this.var_name = var_name;
  var cont = bind(this.cont, this);
  callAsync(function() { cont(); });
}
OXN_Get.prototype = new OXN("Get");

OXN_Get.prototype.cont = function() {
  if (!this.xc) return; // we've been aborted
  // XXX throw exception if value not bound?
  this.xc.next.cont(this.xc, this.env[this.var_name]);
  this.clear();
};

OXN_Get.prototype.abort = function() {
  this.clear();
};

OXN_Get.prototype.clear = function() {
  if (!this.xc) return;
  delete this.xc;
  delete this.env;
  delete this.var_name;
};

// bind to Get expression node:
OEN_Get.prototype.execute = function(xc, env) {
  return new OXN_Get(this.var_name, xc ,env);
};

//----------------------------------------------------------------------
// Closure execution:

// execution node for execute() calls:
// evalute to self (XXX can this ever be reached?):
OAN_Closure.prototype.execute = function(xc, env) {
  return new OXN_Quote(this, xc);
};

// closure apply: The key to tail calls is not to generate an
// execution node here, but just insert our saved (lexical)
// environment + formals bindings into the call to body_exp
OAN_Closure.prototype.apply = function(xc, caller_env, args) {
  // create an environment with formals bound to args, and rooted in the
  // lexical environment passed in as argument:
  // XXX don't have __proto__ in IE
  // var env = {};
  // env.__proto__ = this.env;
  function Env() {}
  Env.prototype = this.env;
  var env = new Env();

  for (var i=0; i<this.formals.length; ++i) {
    // xxx what to do when we have more/less args than formals?
    env[this.formals[i]] = args[i];
  }
  this.body_exp.execute(xc, env);
};

//----------------------------------------------------------------------
// Lambda execution node:
function OXN_Lambda(formals, body_exp, xc, env) {
  this.xc = xc;
  this.xc.current = this;
  
  this.closure = new OAN_Closure(formals, body_exp, env);
  var cont = bind(this.cont, this);
  callAsync(cont);
}
OXN_Lambda.prototype = new OXN("Lambda");

OXN_Lambda.prototype.cont = function() {
  if (!this.xc) return; // we've been aborted
  this.xc.next.cont(this.xc, this.closure);
  this.clear();
};

OXN_Lambda.prototype.abort = function() {
  this.clear();
}

OXN_Lambda.prototype.clear = function() {
  if (!this.xc) return;
  delete this.xc;
  delete this.closure;
};

// bind to Lambda expression node:
OEN_Lambda.prototype.execute = function(xc, env) {
  return new OXN_Lambda(this.formals, this.body_exp, xc, env);
};

//----------------------------------------------------------------------
// Throw execution node:
// executes tag_exp and val_exp in parallel, returns exception made from the two
function OXN_Throw(tag_exp, val_exp, xc, env) {
  this.xc = xc;
  this.xc.current = this;
  
  this.fork_count = 2;
  this.forks = [];
  this.forks.push(fork(env, this, tag_exp));
  this.forks.push(fork(env, this, val_exp));
}
OXN_Throw.prototype = new OXN("Throw");

OXN_Throw.prototype.cont = function(exiting_context, rv) {
  if (isOniException(rv)) {
    this.xc.next.cont(this.xc, rv);
    return;
  }

  // replace context by result:
  for (var i=0; i<this.forks.length; ++i)
    if (this.forks[i] == exiting_context) {
      this.forks[i].current = null;
      this.forks[i].rv = rv;
      break;
    }
  // xxx assert that the context was found

  if (--this.fork_count == 0) {
    this.xc.next.cont(this.xc, new OXX(this.forks[0].rv, this.forks[1].rv));
    this.clear();
  }
};

OXN_Throw.prototype.abort = function() {
  if (this.forks) {
    for (var i=0; i<this.forks.length; ++i) {
      if (this.forks[i].current)
        this.forks[i].current.abort();
    }
    this.clear();
  }
};

OXN_Throw.prototype.clear = function() {
  delete this.xc;
  delete this.forks;
};

// bind to Throw expression node:
OEN_Throw.prototype.execute = function(xc, env) {
  return new OXN_Throw(this.tag_exp, this.val_exp, xc, env);
};

//----------------------------------------------------------------------
// Catch execution node:
// execute tag_exp, then body_exp; catch any returns with tag_exp and
// execute handler_exp if an exception was caught
function OXN_Catch(tag_exp, body_exp, handler_exp, xc, env) {
  this.xc = xc;
  this.xc.current = this;
  this.env = env;
  
  this.body_exp = body_exp;
  this.handler_exp = handler_exp;
  this.pending_exception = null;
  
  // we're the context for the execution of tag_exp, body_exp and
  // handler_exp:
  this.next = this;
  this.current = null;
  
  tag_exp.execute(this, this.env);
}
OXN_Catch.prototype = new OXN("Catch");

OXN_Catch.prototype.cont = function(exiting_context, rv) {
  if (this.body_exp) {
    // this is the tag_exp finishing
    if (isOniException(rv)) {
      this.xc.next.cont(this.xc, rv);
      return;
    }
    this.tag = rv;
    this.body_exp.execute(this, this.env);
    delete this.body_exp;
  }
  else if (this.pending_exception) {
    // this is the handler_exp finishing    
    // we assume that it returned a OAN on which we'll make a tail
    // call, passing in the exception's value:
    if (isOniException(rv)) {
      this.xc.next.cont(this.xc, rv);
      return;
    }
    rv.apply(this.xc, this.env, [this.pending_exception.value]);
    this.clear();
  }
  else {
    // this is the body_exp finishing
    if (isOniException(rv)) {
      if (rv.tag != this.tag) {
        // exception isn't addressed to us -> pass through
        this.xc.next.cont(this.xc, rv);
        return;
      }

      // this is our exception. abort current execution, and pass up
      // result, or, if we have a handler_exp, resolve the exp and
      // pass the exception value through it:
      this.current.abort();
      if (this.handler_exp) {
        // keep hold of exception object:
        this.pending_exception = rv;
        // resolve handler_exp:
        this.handler_exp.execute(this, this.env);
        delete this.handler_exp;
        return;
      }
      else {
        // no handler_exp... just return the exception's value:
        this.xc.next.cont(this.xc, rv.value);
      }
    }
    else {
      // no exception... return value of body_exp:
      this.xc.next.cont(this.xc, rv);
    }
    this.clear();
  }
};

OXN_Catch.prototype.abort = function() {
  if (this.current) {
    this.current.abort();
    this.clear();
  }
};

OXN_Catch.prototype.clear = function() {
  delete this.xc;
  delete this.env;
  delete this.current;
  delete this.body_exp;
  delete this.handler_exp;
  delete this.pending_exception;
  delete this.tag;
};

// bind to Catch expression node:
OEN_Catch.prototype.execute = function(xc, env) {
  return new OXN_Catch(this.tag_exp, this.body_exp,
                       this.handler_exp, xc, env);
};

//----------------------------------------------------------------------
// If execution node:
function OXN_If(test_exp, consequent_exp, alternative_exp, xc, env) {
  this.xc = xc;
  this.xc.current = this;
  this.env = env;
  
  this.consequent_exp = consequent_exp;
  this.alternative_exp = alternative_exp;
  
  // we're also the context for the execution of test_exp:
  this.next = this;
  this.current = null;
  
  test_exp.execute(this, this.env);
}
OXN_If.prototype = new OXN("If");

OXN_If.prototype.cont = function(exiting_context, rv) {
  if (isOniException(rv)) {
    this.xc.next.cont(this.xc, rv);
    return;
  }

  if (rv && this.consequent_exp) {
    // tail call
    this.consequent_exp.execute(this.xc, this.env);
  }
  else if (!rv && this.alternative_exp) {
    // tail call
    this.alternative_exp.execute(this.xc, this.env);
  }
  else {
    this.xc.next.cont(this.xc, rv);
  }
  this.clear();
};

OXN_If.prototype.abort = function() {
  if (this.current) {
    this.current.abort();
    this.clear();
  }
};

OXN_If.prototype.clear = function() {
  delete this.xc;
  delete this.env;
  delete this.current;
};

// bind to if expression node:
OEN_If.prototype.execute = function(xc, env) {
  return new OXN_If(this.test_exp, this.consequent_exp, this.alternative_exp, xc, env);
}

//----------------------------------------------------------------------
// Running an ONI expression:

OEN.prototype.run = function() {
  var oxn_top = {
    cont : function(exiting_context, rv) {
      // dump("top level return:"+rv+"\n");
      if (isOniException(rv)) {
        // dump("uncaught exception\n");
        exiting_context.current.abort();
      }
      delete this.current;
    },
    abort : function() {
      if (this.current) {
        this.current.abort();
        delete this.current;
      }
    },
    current : null
  };
  oxn_top.next = oxn_top;
  
  this.execute(oxn_top, {});
  return oxn_top;
};

////////////////////////////////////////////////////////////////////////
// Surface syntax for expression graph construction


// helpers for preconditioning arg expressions:
// (selfquoting of host language data (p_exp -> oni_exp); converting fexps to OANs)

function precondition_arg(e) {
  if (is_oni_fexp(e))
    return oni_fexp_to_OEN(e);
  else if (!isOEN(e))
    return Quote(e);
  return e;
}

function precondition_arg_list(l) {
  for (var i=0; i<l.length; ++i) {
    if (is_oni_fexp(l[i]))
      l[i] = oni_fexp_to_OEN(l[i]);
    else if (!isOEN(l[i]))
      l[i] = Quote(l[i]);
  }
}

//----------------------------------------------------------------------
// oni_exp constructors:

// Seq : exp* -> oni_exp
function Seq(/* exp1, exp2, ... */) {
  precondition_arg_list(arguments);
  return new OEN_Seq(arguments);
}
this["Seq"] = Seq;

// Alt : exp* -> oni_exp
function Alt(/* exp1, exp2, ... */) {
  precondition_arg_list(arguments);
  return new OEN_Alt(arguments);
}
this["Alt"] = Alt;

// Quote : datum -> oni_exp
var Quote = function(datum) {
  return new OEN_Quote(datum);
}
this["Quote"] = Quote;

// Apply : exp, exp* -> oni_exp
function Apply(/* fexp, aexp1, aexp2, ... */) {
  precondition_arg_list(arguments);
  return new OEN_Apply(arguments[0], slice_args(arguments, 1));
}
this["Apply"] = Apply;

// Exec : exp -> oni_exp
var Exec = Apply;
this["Exec"] = Exec;

// If : exp, exp, exp? -> oni_exp
function If(/* test_exp, consequent_exp, alternative_exp? */) {
  precondition_arg_list(arguments);
  return new OEN_If(arguments[0], arguments[1], arguments[2]);
}
this["If"] = If;

// Let : bindings, exp+ -> oni_exp
function Let(/* bindings, exp+ */) {
  var bindings = arguments[0];
  for (b in bindings)
    bindings[b] = precondition_arg(bindings[b]);
    
  var exp = slice_args(arguments, 1);
  if (exp.length == 1)
    exp = precondition_arg(exp[0]);
  else
    exp = Seq.apply(this, exp);
  
  return new OEN_Let(bindings, exp);
}
this["Let"] = Let;

// Get : var_name -> oni_exp
var Get = function(var_name) {
  return new OEN_Get(var_name);
}
this["Get"] = Get;

// Throw : tag, exp? -> oni_exp
function Throw(tag, val_exp) {
  return new OEN_Throw(Quote(tag), precondition_arg(val_exp));
};
this["Throw"] = Throw;

// Catch : [tag, exp?], exp+ -> oni_exp
// handler_exp, if provided, must resolve to an OAN.
function Catch(/*tag_handler, exp*/) {
  var tag_handler = arguments[0];
  var body_exp = slice_args(arguments, 1);
  if (body_exp.length == 1)
    body_exp = precondition_arg(body_exp[0]);
  else
    body_exp = Seq.apply(this, body_exp);
  
  return new OEN_Catch(Quote(tag_handler[0]),
                       precondition_arg(body_exp),
                       tag_handler[1] ? precondition_arg(tag_handler[1]) : null);
};
this["Catch"] = Catch;

// Delay : exp, exp* -> oni_exp
function Delay(/* duration, exp* */) {
  var duration = arguments[0];
  var exps = slice_args(arguments, 1);
  precondition_arg_list(exps);
  exps.unshift(Apply(Timeout, duration));
  return Seq.apply(this, exps);
}
this["Delay"] = Delay;

// Loop : exp+ -> oni_exp
// Break : exp? -> oni_exp
// Continue : void -> oni_exp
var loop_exit = {};
var loop_continue = {};
function Loop(/*exp+*/) {
  var exp = slice_args(arguments, 0);
  if (exp.length == 1)
    exp = precondition_arg(exp[0]);
  else
    exp = Seq.apply(this, exp);
  
  // XXX __loop__ shouldn't be visible in the environment 
  return Catch([loop_exit],
               Let({ "__loop__" : Lambda([], Catch([loop_continue], exp), Exec(Get("__loop__")) )
                   },
                   Exec(Get("__loop__"))));
}
function Break(exp) {
  return Throw(loop_exit, exp);
}
function Continue() {
  return Throw(loop_continue);
}
this["Loop"] = Loop;
this["Break"] = Break;
this["Continue"] = Continue;

//----------------------------------------------------------------------
// oni_fexp constructors:

var ONI_FEXP_TOKEN = {};
var ONI_FEXP_TO_OEN_TOKEN = {};

function is_oni_fexp(e) {
  if (e && e._type == ONI_FEXP_TOKEN)
    return true;
  return false;
}

function oni_fexp_to_OEN(e) {
  return e(ONI_FEXP_TO_OEN_TOKEN);
}

// ALift : async_f -> oni_fexp
function ALift(async_f) {
  var f = function() {
    if (arguments[0] == ONI_FEXP_TO_OEN_TOKEN) {
      return new OAN_ALift(async_f);
    }
    else {
      var exps = slice_args(arguments, 0);
      exps.unshift(new OAN_ALift(async_f));
      return Apply.apply(this, exps);
    }
  };
  f._type = ONI_FEXP_TOKEN;
  return f;
}
this["ALift"] = ALift;

// SLift : sync_f -> oni_fexp
function SLift(sync_f) {
  var f = function() {
    if (arguments[0] == ONI_FEXP_TO_OEN_TOKEN) {
      return new OAN_SLift(sync_f);
    }
    else {
      var exps = slice_args(arguments, 0);
      exps.unshift(new OAN_SLift(sync_f));
      return Apply.apply(this, exps);
    }
  };
  f._type = ONI_FEXP_TOKEN;
  return f;
}
this["SLift"] = SLift;

// Lambda : [formals], exp+ -> oni_fexp
function Lambda(/* formals, exp+ */) {
  var formals = arguments[0];
  var body_exp = slice_args(arguments, 1);
  if (body_exp.length == 1)
    body_exp = precondition_arg(body_exp[0]);
  else
    body_exp = Seq.apply(this, body_exp);
  
  var f = function() {
    if (arguments[0] == ONI_FEXP_TO_OEN_TOKEN) {
      return new OEN_Lambda(formals, body_exp);
    }
    else {
      var exps = slice_args(arguments, 0);
      exps.unshift(new OEN_Lambda(formals, body_exp));
      return Apply.apply(this, exps);
    }
  };
  f._type = ONI_FEXP_TOKEN;
  return f;
}
this["Lambda"] = Lambda;

// Defun : [formals], exp+ -> oni_fexp
function Defun(/* formals, exp+ */) {
  var formals = arguments[0];
  var body_exp = slice_args(arguments, 1);
  if (body_exp.length == 1)
    body_exp = precondition_arg(body_exp[0]);
  else
    body_exp = Seq.apply(this, body_exp);
  
  var f = function() {
    if (arguments[0] == ONI_FEXP_TO_OEN_TOKEN) {
      return new OAN_Closure(formals, body_exp, {});
    }
    else {
      var exps = slice_args(arguments, 0);
      exps.unshift(new OAN_Closure(formals, body_exp, {}));
      return Apply.apply(this, exps);
    }
  };
  f._type = ONI_FEXP_TOKEN;
  return f;
}
this["Defun"] = Defun;

// Nop : oni_fexp
var Nop = SLift(function() { return null; });
this["Nop"] = Nop;

// Stop : oni_fexp
var Stop = ALift(function() { /* continuation never called */ });
this["Stop"] = Stop;

// Timeout : oni_fexp
var Timeout = ALift(timeout);
this["Timeout"] = Timeout;

// Par : oni_fexp
var Par = Nop;
this["Par"] = Par;

// Member : oni_fexp
var Member = SLift(function(obj, elem) { return obj[elem]; });
this["Member"] = Member;


//////////////////////////////////////////////////////////////////////
// Signals

function _Signal() {
  this.listeners = [];
}
_Signal.prototype = {};

_Signal.prototype.notify = function(val) {
  var ls = this.listeners;
  this.listeners = [];
  for (var i=0; i<ls.length; ++i) {
    ls[i]([true, val]);
  }
};

_Signal.prototype.wait = function(cont) {
  this.listeners.push(cont);
  var me = this;
  return function() {
    for (var i=0; i<me.listeners.length; ++i) {
      if (me.listeners[i] == cont) {
        me.listeners.splice(i, 1);
        return;
      }
    }
  };
};

// static Signal API:
var Signal = {};
Signal.create = function() { return new _Signal(); };
Signal.Create = SLift(Signal.create);
Signal.Notify = SLift(function(s, val) { return s.notify(val);});
Signal.Wait = ALift(function(cont, s) { return s.wait(cont); });

this["Signal"] = Signal;

////////////////////////////////////////////////////////////////////////
// Barriers

function _Barrier(is_open) {
  this.is_open = is_open ? true : false;
  this.listeners = [];
}
_Barrier.prototype = {};

_Barrier.prototype.open = function() {
  this.is_open = true;
  var ls = this.listeners;
  this.listeners = [];
  for (var i=0; i<ls.length; ++i) {
    ls[i]([true, null]);
  }
};

_Barrier.prototype.close = function() {
  this.is_open = false;
};

_Barrier.prototype.pass = function(cont) {
  if (this.is_open)
    callAsync(function() { cont([true, null]); });
  else {
    this.listeners.push(cont);
    var me = this;
    return function() {
      for (var i=0; i<me.listeners.length; ++i) {
        if (me.listeners[i] == cont) {
          me.listeners.splice(i, 1);
          return;
        }
      }
    };
  }
};

// static Barrier API
var Barrier = {};
Barrier.create = function(is_open) { return new _Barrier(is_open); };
Barrier.Create = SLift(Barrier.create);
Barrier.Open = SLift(function(b) { return b.open();} );
Barrier.Close = SLift(function(b) { return b.close();});
Barrier.Pass = ALift(function(cont, b) { return b.pass(cont);});
  
this["Barrier"] = Barrier;

////////////////////////////////////////////////////////////////////////
// Channels

function _Channel() {
  this.puts = [];
  this.collects = [];
  this.availBarrier = Barrier.create(false);
  this.emptyBarrier = Barrier.create(true);    
}
_Channel.prototype = {};

_Channel.prototype.put = function(cont, val) {
  this.puts.push({ val: val, cont: cont });
  this.process();
};

_Channel.prototype.collect = function(cont) {
  this.collects.push(cont);
  this.process();
};

_Channel.prototype.process = function() {
  if (this.puts.length && this.collects.length) {
    var p = this.puts.shift();
    var c = this.collects.shift();
    c([true, p.val]);
    if (p.cont)
      p.cont([true,null]);
  }
  
  if (this.puts.length && !this.collects.length)
    this.availBarrier.open();
  else
    this.availBarrier.close();

  if (!this.puts.length)
    this.emptyBarrier.open();
  else
    this.emptyBarrier.close();
};

_Channel.prototype.waitAvail = function(cont) {
  return this.availBarrier.pass(cont);
};

_Channel.prototype.waitEmpty = function(cont) {
  return this.emptyBarrier.pass(cont);
};

// static Channel API:
var Channel = {};
Channel.create = function() { return new _Channel(); };
Channel.Create = SLift(Channel.create);
Channel.Put = ALift(function(cont, c, val) { return c.put(cont, val);});
Channel.Collect = ALift(function(cont, c) { return c.collect(cont);});
Channel.WaitAvail = ALift(function(cont, c) { return c.waitAvail(cont);}); 
Channel.WaitEmpty = ALift(function(cont, c) { return c.waitEmpty(cont);});

this["Channel"] = Channel;

})()
