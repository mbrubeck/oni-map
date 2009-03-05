/*
** Asynchronous iteration in JavaScript and Oni
** Copyright (c) 2009 Matt Brubeck
** 
** Permission is hereby granted, free of charge, to any person obtaining a copy
** of this software and associated documentation files (the "Software"), to deal
** in the Software without restriction, including without limitation the rights
** to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
** copies of the Software, and to permit persons to whom the Software is
** furnished to do so, subject to the following conditions:
** 
** The above copyright notice and this permission notice shall be included in
** all copies or substantial portions of the Software.
** 
** THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
** IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
** FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
** AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
** LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
** OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
** THE SOFTWARE.
**/

// ONI VERSION

/**
 * EachWith(Par, F, [a,b,...]) -> Par(F(a), F(b), ...)
 * EachWith(Seq, F, [a,b,...]) -> Seq(F(a), F(b), ...)
 */
var EachWith = function(Combinator, F, arr) {
  return Combinator.apply(this, arr.map(F));
};

/**
 * MapWith(Combinator, F, [a,b,...]).run() -> [<F(a)>, <F(b)>, ...]
 *
 * "Combinator" can be Par (to call F in parallel) or Seq (to call F sequentially).
 */
var MapWith = function(Combinator, F, arr) {
  return Let({ result: [], arr: arr },
    Seq(
      EachWith(Combinator,
        Lambda(['i'], SetAt('result', 'i', F(GetAt('arr', 'i')))),
        range(arr.length)),
      Get('result')));
};

var GetAt = function(arr_var, i_var) {
  return Apply(SLift(get_at), Get(arr_var), Get(i_var));
}
var SetAt = function(arr_var, i_var, val) {
  return Apply(SLift(set_at), Get(arr_var), Get(i_var), val);
};

var get_at = function(arr, i) { return arr[i]; };
var set_at = function(arr, i, val) { arr[i] = val; };

var range = function(n) {
  var result = [];
  for (var i=0; i<n; i++) {
    result.push(i);
  }
  return result;
};

// PURE JAVASCRIPT VERSION

var foldl_seq = function(step, zero, arr, callback) {
  var next = function(i, acc) {
    if (i < arr.length) {
      step(acc, arr[i], function(result) { next(i+1, result); });
    } else {
      callback(acc);
    }
  };
  next(0, zero);
};

var map_seq = function(f, arr, callback) {
  foldl_seq(function(a, b, next) { 
      f(b, function(result) { next(a.concat([result])); });
    }, [], arr, callback);
};

var each_seq = function(f, arr, callback) {
  foldl_seq(function(a, b, next) { f(b, next); }, null, arr, callback);
};

// TEST UTILITIES

Print = SLift(function(s) { console.log(s); });

Square = SLift(function(x) { return x*x; });
ASquare = ALift(function(cont, x) {
  window.setTimeout(function() {
    cont([true, x*x]);
  }, Math.random() * 200); // Continue after a random 0-200 ms delay.
});

timer = function() {
  var _timer = new Date().getTime();
  return function(message) {
    var previous = _timer;
    _timer = new Date().getTime();
    if (message !== undefined) {
      window.console.log('TIMER:'+message+':'+ (_timer-previous));
    }
  };
}();
Timer = SLift(timer);

// TESTS

foldl_seq(function(a,b,next) { next(a+b); }, 0, [0,1,2,3,4,5], function(result) {
  (result == 15) || alert("foldl_seq failed");
});

map_seq(function(x, next) { next(2*x); }, [0,1,2,3,4,5], function(result) {
  (result[0] == 0 && result[5] == 10) || alert("map_seq failed");
});

(function() {
  var result = [];
  each_seq(function(x, next) { result.push(x); next(); }, [0,1,2,3,4,5], function() {});
  (result[0] == 0 && result[5] == 5) || alert("each_seq failed");
})();

EachWith(Par, Print, [0,1,2,3,4,5]).run();
EachWith(Seq, Print, [0,1,2,3,4,5]).run();

// TIMING TESTS

Seq(
  Timer(),
  Print(MapWith(Par, Square,  [0,1,2,3,4,5])),
  Timer("MapWith Par Square"),
  Print(MapWith(Par, ASquare, [0,1,2,3,4,5])),
  Timer("MapWith Par ASquare"),
  Print(MapWith(Seq, Square,  [0,1,2,3,4,5])),
  Timer("MapWith Seq Square"),
  Print(MapWith(Seq, ASquare, [0,1,2,3,4,5])),
  Timer("MapWith Seq ASquare")
).run();
