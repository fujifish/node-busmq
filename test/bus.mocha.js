var Should = require('should');
var redisHelper = require('./redis-helper');
var Bus = require('../lib/bus');

var redisPorts = [9888];
var redisUrls = [];
redisPorts.forEach(function(port) {
  redisUrls.push('redis://127.0.0.1:'+port);
})

var redises = [];

function redisStart(port, done) {
  var redis = redisHelper.open(port);
  redises.push(redis);
  redis.on('error', function(err) {
    done(new Error(err));
  });
  redis.on('ready', function() {
    done();
  });
}

function redisStop(redis, done) {
  redis.close(function() {
    redises.splice(redises.indexOf(redis), 1);
    done();
  });
}

describe('Bus', function() {

  if (this.timeout() === 0) {
    this.enableTimeouts(false);
  }

  // start the redis servers
  before(function(done) {
    var dones = 0;
    for (var i = 0; i < redisPorts.length; ++i) {
      redisStart(redisPorts[i], function() {
        if (++dones === redisPorts.length) {
          done();
        }
      });
    }
  });

  // stop all redis servers
  after(function(done) {
    var dones = 0;
    for (var i = 0; i < redisPorts.length; ++i) {
      redisStop(redises[i], function() {
        if (++dones === redisPorts.length) {
          done();
        }
      });
    }
  });

  describe('bus connection', function() {

    it('should emit online event when connected and offline event after disconnecting', function(done) {
      var bus = Bus.create();
      bus.on('error', function(err) {
        done(err);
      });
      bus.on('online', function() {
        bus.disconnect();
      });
      bus.on('offline', function() {
        done();
      });
      bus.connect(redisUrls);
    });

    it('should emit error if calling connect twice', function(done) {
      var bus = Bus.create();
      var dones = 0;
      var onlines = 0;
      bus.on('error', function(err) {
        err.should.be.exactly('already connected');
        bus.disconnect();
      });
      bus.on('online', function() {
        if (++onlines === 1) {
          bus.connect('redis://127.0.0.1:9888');
        } else {
          done('online should not have been called twice');
        }
      });
      bus.on('offline', function() {
        ++dones;
        if (dones === 1) {
          done();
        } else if (dones > 1) {
          done('offline should not have been called twice');
        }
      });
      bus.connect(redisUrls);
    });

    it('should emit offline when redis goes down, and online when it\'s back again', function(done) {
      var bus = Bus.create();
      var onlines = 0;
      var offlines = 0;
      bus.on('error', function(){});
      bus.on('online', function() {
        ++onlines;
        if (onlines === 1) {
          redisStop(redises[0], function() {});
        } else if (onlines === 2) {
          bus.disconnect();
        } else {
          done('too many online events');
        }
      });
      bus.on('offline', function() {
        ++offlines;
        if (offlines === 1) {
          redisStart(redisPorts[0], function(){});
        } else if (offlines === 2) {
          done();
        } else {
          done('too many offline events');
        }
      });
      bus.connect(redisUrls);
    })
  })

  describe('producers and consumers', function() {

    it('should receive attach/detach events', function(done) {
      var count = 0;
      function _count() {
        ++count;
      }
      var bus = Bus.create();
      bus.on('error', done);
      bus.on('online', function() {
        var qName = 'test'+Math.random();
        // create producer
        var p = bus.queue(qName);
        p.on('error', done);
        p.on('detaching', _count);
        p.on('detached', function() {
          _count();
          bus.disconnect();
        });
        p.on('attaching', _count);
        p.on('attached', function() {
          _count();
          var c = bus.queue(qName);
          c.on('error', done);
          c.on('detaching', _count);
          c.on('detached', function() {
            _count();
            p.detach();
          });
          c.on('attaching', _count);
          c.on('attached', function() {
            _count();
            c.detach();
          });
          c.attach();
        });
        p.attach();
      });
      bus.on('offline', function() {
        count.should.be.exactly(8);
        done();
      });
      bus.connect(redisUrls);
    });

    describe('consuming messages', function() {

      it('producer attach -> producer push -> consumer attach -> consumer receive', function(done) {
        var testMessage = 'test message';
        var consumed = 0;
        var bus = Bus.create();
        bus.on('error', done);
        bus.on('online', function() {
          var qName = 'test'+Math.random();
          // create producer
          var p = bus.queue(qName);
          p.on('error', done);
          p.on('detached', function() {
            var c = bus.queue(qName);
            c.on('error', done);
            c.on('message', function(message) {
              message.should.be.exactly(testMessage);
              ++consumed;
              c.detach();
            });
            c.on('detached', function() {
              bus.disconnect();
            });
            c.on('attached', function() {
              // wait for messages
              c.consume();
            });
            c.attach();
          });
          p.on('attached', function() {
            // push a message
            p.push(testMessage);
            p.detach();
          });
          p.attach();
        });
        bus.on('offline', function() {
          consumed.should.be.exactly(1);
          done();
        });
        bus.connect(redisUrls);
      });

      it('producer attach -> consumer attach -> producer push -> consumer receive', function(done) {
        var testMessage = 'test message';
        var consumed = 0;
        var bus = Bus.create();
        bus.on('error', done);
        bus.on('online', function() {
          var qName = 'test'+Math.random();
          // create producer
          var p = bus.queue(qName);
          p.on('error', done);
          p.on('attached', function() {
            var c = bus.queue(qName);
            c.on('error', done);
            c.on('message', function(message) {
              message.should.be.exactly(testMessage);
              ++consumed;
              p.detach();
              c.detach();
            });
            c.on('detached', function() {
              bus.disconnect();
            });
            c.on('attached', function() {
              // wait for messages
              c.consume();
              // push a messages
              p.push(testMessage)
            });
            c.attach();
          });
          p.attach();
        });
        bus.on('offline', function() {
          consumed.should.be.exactly(1);
          done();
        });
        bus.connect(redisUrls);
      });

      it('consumer attach -> producer attach -> producer push -> consumer receive', function(done) {
        var testMessage = 'test message';
        var consumed = 0;
        var bus = Bus.create();
        bus.on('error', done);
        bus.on('online', function() {
          var qName = 'test'+Math.random();
          // create consumer
          var p;
          var c = bus.queue(qName);
          c.on('error', done);
          c.on('message', function(message) {
            message.should.be.exactly(testMessage);
            ++consumed;
            c.detach();
            p.detach();
          });
          c.on('attached', function() {
            // wait for messages
            c.consume();
            // create producer
            p = bus.queue(qName);
            p.on('error', done);
            p.on('detached', function() {
              bus.disconnect();
            });
            p.on('attached', function() {
              // push a messages
              p.push(testMessage)
            });
            p.attach();
          });
          c.attach();

        });
        bus.on('offline', function() {
          consumed.should.be.exactly(1);
          done();
        });
        bus.connect(redisUrls);
      });

      it('producer attach -> producer push(5) -> consumer attach -> consumer receive(5)', function(done) {
        var testMessage = 'test message';
        var consumed = 0;
        var bus = Bus.create();
        bus.on('error', done);
        bus.on('online', function() {
          var qName = 'test'+Math.random();
          // create producer
          var p = bus.queue(qName);
          p.on('error', done);
          p.on('detached', function() {
            var c = bus.queue(qName);
            c.on('error', done);
            c.on('message', function(message) {
              message.should.be.exactly(testMessage);
              if (++consumed === 5) {
                c.detach();
              }
            });
            c.on('detached', function() {
              bus.disconnect();
            });
            c.on('attached', function() {
              // wait for messages
              c.consume();
            });
            c.attach();
          });
          p.on('attached', function() {
            // push 5 message
            for (var i = 0; i < 5; ++i) {
              p.push(testMessage);
            }
            p.detach();
          });
          p.attach();
        });
        bus.on('offline', function() {
          consumed.should.be.exactly(5);
          done();
        });
        bus.connect(redisUrls);
      });

      it('producer push(5) -> producer attach -> consumer attach -> consumer receive(5)', function(done) {
        var testMessage = 'test message';
        var consumed = 0;
        var bus = Bus.create();
        bus.on('error', done);
        bus.on('online', function() {
          var qName = 'test'+Math.random();
          // create producer
          var p = bus.queue(qName);
          p.on('error', done);
          p.on('detached', function() {
            var c = bus.queue(qName);
            c.on('error', done);
            c.on('message', function(message) {
              message.should.be.exactly(testMessage);
              if (++consumed === 5) {
                c.detach();
              }
            });
            c.on('detached', function() {
              bus.disconnect();
            });
            c.on('attached', function() {
              // wait for messages
              c.consume();
            });
            c.attach();
          });
          p.on('attached', function() {
            p.detach();
          });
          // push 5 message
          for (var i = 0; i < 5; ++i) {
            p.push(testMessage);
          }
          // attach
          p.attach();
        });
        bus.on('offline', function() {
          consumed.should.be.exactly(5);
          done();
        });
        bus.connect(redisUrls);
      });

      it('queue should not expire if detaching and re-attaching before queue ttl passes', function(done) {
        var testMessage = 'test message';
        var bus = Bus.create();
        bus.on('error', done);
        bus.on('online', function() {
          var qName = 'test'+Math.random();
          // create producer
          var p = bus.queue(qName);
          p.on('error', done);
          p.on('detached', function() {
            setTimeout(function() {
              // ttl is 2 seconds, we re-attach after 1 second
              p.exists(function(exists) {
                exists.should.be.exactly(true);
                bus.disconnect();
              });
            }, 1000);
          });
          p.on('attached', function() {
            p.push(testMessage);
            var c = bus.queue(qName);
            c.on('error', done);
            c.on('message', function(message) {
              done('message should not have been received')
            });
            c.on('attached', function() {
              c.detach();
              p.detach();
            });
            c.attach();
          });
          p.attach({ttl: 5});
        });
        bus.on('offline', function() {
          done();
        });
        bus.connect(redisUrls);
      });

      it('queue should expire: producer attach -> consumer attach -> producer push -> detach all', function(done) {
        var testMessage = 'test message';
        var bus = Bus.create();
        bus.on('error', done);
        bus.on('online', function() {
          var qName = 'test'+Math.random();
          // create producer
          var p = bus.queue(qName);
          p.on('error', done);
          p.on('detached', function() {

          });
          p.on('attached', function() {
            p.push(testMessage);
            var c = bus.queue(qName);
            c.on('error', done);
            c.on('message', function(message) {
              done('message should not have been received')
            });
            c.on('detached', function() {
              // ttl is 1 second, so the queue must be expired after 1.5 seconds
              setTimeout(function() {
                c.exists(function(exists) {
                  exists.should.be.exactly(false);
                  bus.disconnect();
                });
              }, 1500);
            });
            c.on('attached', function() {
              c.detach();
              p.detach();
            });
            c.attach();
          });
          p.attach({ttl: 1});
        });
        bus.on('offline', function() {
          done();
        });
        bus.connect(redisUrls);
      });
    });

    describe('channels', function() {

      it('server listens -> client connects', function(done) {
        var testMessage = 'test message';
        var sEvents = {'message': 0};
        var cEvents = {'message': 0};
        var bus = Bus.create();
        bus.on('error', done);
        bus.on('online', function() {
          var cName = 'test'+Math.random();
          var cServer = bus.channel(cName);
          var cClient = bus.channel(cName);
          cServer.on('error', function(error) {
            sEvents['error'] = error;
            bus.disconnect();
          });
          cServer.on('connect', function() {
            sEvents['connect'] = true;
            cClient.on('error', function(error) {
              cEvents['error'] = error;
              bus.disconnect();
            });
            cClient.on('connect', function() {
              cEvents['connect'] = true;
            });
            cClient.on('remote:connect', function() {
              cEvents['remote:connect'] = true;
              cClient.send(testMessage);
            });
            cClient.on('message', function(message) {
              message.should.be.exactly(testMessage);
              if (++cEvents['message'] < 5) {
                cClient.send(testMessage);
              } else {
                cClient.end();
              }
            });
            cClient.on('end', function() {
              cEvents['end'] = true;
            });
            cClient.connect();
          });
          cServer.on('remote:connect', function() {
            sEvents['remote:connect'] = true;
          });
          cServer.on('message', function(message) {
            message.should.be.exactly(testMessage);
            ++sEvents['message'];
            cServer.send(testMessage);
          });
          cServer.on('end', function() {
            sEvents['end'] = true;
            bus.disconnect();
          });
          cServer.listen();
        });
        bus.on('offline', function() {
          Should(sEvents['connect']).equal(true);
          Should(sEvents['remote:connect']).equal(true);
          Should(sEvents['message']).equal(5);
          Should(sEvents['end']).equal(true);
          Should(sEvents['error']).equal(undefined);

          Should(cEvents['connect']).equal(true);
          Should(cEvents['remote:connect']).equal(true);
          Should(cEvents['message']).equal(5);
          Should(cEvents['end']).equal(undefined);
          Should(cEvents['error']).equal(undefined);

          done();
        });
        bus.connect(redisUrls);
      });

      it('client connects -> server listens', function(done) {
        var testMessage = 'test message';
        var sEvents = {'message': 0};
        var cEvents = {'message': 0};
        var bus = Bus.create();
        bus.on('error', done);
        bus.on('online', function() {
          var cName = 'test'+Math.random();
          var cServer = bus.channel(cName);
          var cClient = bus.channel(cName);
          cClient.on('error', function(error) {
            cEvents['error'] = error;
            bus.disconnect();
          });
          cClient.on('connect', function() {
            cEvents['connect'] = true;
            cServer.on('error', function(error) {
              sEvents['error'] = error;
              bus.disconnect();
            });
            cServer.on('connect', function() {
              sEvents['connect'] = true;
            });
            cServer.on('remote:connect', function() {
              sEvents['remote:connect'] = true;
              cServer.send(testMessage);
            });
            cServer.on('message', function(message) {
              message.should.be.exactly(testMessage);
              if (++sEvents['message'] < 5) {
                cServer.send(testMessage);
              } else {
                cServer.end();
              }
            });
            cServer.on('end', function() {
              sEvents['end'] = true;
            });
            cServer.listen();
          });
          cClient.on('remote:connect', function() {
            cEvents['remote:connect'] = true;
          });
          cClient.on('message', function(message) {
            message.should.be.exactly(testMessage);
            ++cEvents['message'];
            cClient.send(testMessage);
          });
          cClient.on('end', function() {
            cEvents['end'] = true;
            bus.disconnect();
          });
          cClient.connect();
        });
        bus.on('offline', function() {
          Should(sEvents['connect']).equal(true);
          Should(sEvents['remote:connect']).equal(true);
          Should(sEvents['message']).equal(5);
          Should(sEvents['end']).equal(undefined);
          Should(sEvents['error']).equal(undefined);

          Should(cEvents['connect']).equal(true);
          Should(cEvents['remote:connect']).equal(true);
          Should(cEvents['message']).equal(5);
          Should(cEvents['end']).equal(true);
          Should(cEvents['error']).equal(undefined);

          done();
        });
        bus.connect(redisUrls);
      });
    });
  });
});