Asynchronous Array Functions in JavaScript and Oni
==================================================

When writing JavaScript for web browsers, you have to deal with asynchronous
functions a lot.  Because the environment is single-threaded and event-driven,
everything from DOM events to the HTML5 Database API requires the programmer to
pass around callbacks and continuations.  This is especially important on some
handheld systems like Google Android, where the browser won't redraw the screen
until the programmer returns control to the main event loop.

Each, Map, Fold
---------------

I most recently ran into this when writing an automated test-runner for our
JavaScript application at work.  Since our tests interact with the DOM, they
need to run asynchronously and use callbacks to report their results.  If I
launched them in a for loop, they'd all run in parallel and interfere with each
other.  

So I wrote a generic method to loop over an array asynchronously:

    /**
     * Call f on each element of items, then call done_callback.
     * f should have signature f(item, next), and should call next() when it is done.
     */
    each_seq = function(items, f, done_callback) {
      var iter = function(i) {
        if (i < items.length) {
          var item = items[i];
          f(item, function() { iter(i+1); });
        } else if (done_callback) {
          done_callback();
        }
      };
      iter(0);
    };

With that handy little function, I can easily run my tests in sequence:

    each_seq([test1, test2, test3],
      function each(test, next) {
        test.run(function callback() {
          console.log("test completed: " + test.status);
          next();
        });
      },
      function done() { console.log("all done!"); });

Just for fun, I decided to get even more generic and write an asynchronous `fold`:

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

Then I could implement `map` and `each` in terms of `fold`:
    
    var map_seq = function(f, arr, callback) {
      foldl_seq(function(a, b, next) { 
          f(b, function(result) { next(a.concat([result])); });
        }, [], arr, callback);
    };
    
    var each_seq = function(f, arr, callback) {
      foldl_seq(function(a, b, next) { f(b, next); }, null, arr, callback);
    };

Map and Each in Oni
-------------------

Next, I wanted to try the same thing in the very cool [Oni][1] concurrency library.  Oni is a functional language embedded in JavaScript (and potentially in other host languages) that hides the complexity of flow control for asynchronous code.  For details, check out the excellent documentation and slides on the Oni site.

One nice thing about Oni is that choosing parallel or sequential execution is simple and declarative.  I didn't use `Fold` this time because it doesn't parallelize.  Writing `Each` was easy, but `Map` was a little more complicated:

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

Writing them in Oni was a bit more work, but now they can be combined with Oni's other combinators to work with both synchronous and asynchronous functions, in parallel and in sequence.  You can even call them with `Alt` if you don't care about getting all the results back.  They're tricky enough that it would be nice to have version of them in the standard Oni library.  (A version of Apply that takes its arguments as a JavaScript array would make the implementation more obvious, too.)  

Code
----

See `async-map.js` for the full source to both the pure JavaScript and Oni-based functions.  Open `test.html` in your browser with a debugging console (e.g. Firebug) enabled to run the included tests.

My `EachWith` uses `Array.prototype.map` from JavaScript 1.6.  You could provide a `map` implementation for browsers that don't have their own.  See the source file for the definitions of `GetAt`, `SetAt`, and `range`, which are straightforward.

[1]: http://www.croczilla.com/oni/
