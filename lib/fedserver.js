var events = require('events');
var util = require('util');
var url = require('url');
var WebSocket = require('ws');
var WebSocketStream = require('websocket-stream');
var dnode = require('dnode');

/**
 * FederationServer
 * @param bus
 * @param options
 * @constructor
 */
function FederationServer(bus, options) {
  events.EventEmitter.call(this);
  this.bus = bus;
  this.logger = bus.logger.withTag(bus.id + ':federation-server');
  this.federates = {};
  this._options(options);
}

util.inherits(FederationServer, events.EventEmitter);

/**
 * Setup FederationServer options
 * @param options options to set
 * @private
 */
FederationServer.prototype._options = function(options) {
  this.options = options || {};
  this.options.secret = this.options.secret || 'notsosecret';
};

/**
 * Start the federation server
 */
FederationServer.prototype.listen = function() {
  if (this.listening) {
    return;
  }
  if (this.options.server) {
    var _this = this;
    this.options.server.listen(this.options.port);
    this.wss = new WebSocket.Server({server: this.options.server, verifyClient: this._verifyClient.bind(this)});
    this.wss.on('connection', function(ws) {
      _this._onConnection(ws);
    });
    this.wss.on('listening', function() {
      _this.logger.debug('websocket server is listening');
      _this.listening = true;
      _this.emit('listening');
    });
    this.wss.on('error', function(err) {
      _this.logger.error('error on websocket server: ' + JSON.stringify(err));
      _this.emit('error', err);
    })
  }
};

/**
 * Close the federation server
 */
FederationServer.prototype.close = function() {
  if (!this.listening) {
    return;
  }
  this.listening = false;
  this.wss.close();
  this.wss = null;
  this.options.server.close();
};

/**
 * Handle a new connection
 * @param ws the new connection
 * @private
 */
FederationServer.prototype._onConnection = function(ws) {
  this.logger.info('new federate client connection');
  var _this = this;

  var object;
  var d;
  ws.once('message', function(msg) {
    _this.logger.info('received message: ' + msg);
    msg = JSON.parse(msg);
    object = _this.bus[msg.type].apply(_this.bus, msg.args);
    _this.logger.info('creating federated object ' + object.id);
    d = _this._federate(object, ws);
  });

  ws.on('close', function() {
    if (object) {
      _this.logger.info('federate client connection closed for object ' + object.id);
      delete _this.federates[object.id];
      object.detach();
      object = null;
    }
    if (d) {
      d.end();
      d = null;
    }
  });

  ws.on('error', function(err) {
    if (object) {
      _this.logger.info('federate client error: ' + JSON.stringify(err));
      delete _this.federates[object.id];
      object.detach();
      object = null;
    }
    if (d) {
      d.end();
      d = null;
    }
  });
};

/**
 * Hookup all public methods of an object to be served remotely
 * @param object
 * @param ws
 * @private
 */
FederationServer.prototype._federate = function(object, ws) {
  this.federates[object.id] = object;

  // all public methods of the object get federate-ability + the 'on' and 'once' methods
  var methods = ['on', 'once'].concat(Object.getOwnPropertyNames(object.constructor.prototype));
  var federatedMethods = methods.filter(function(prop) {
    return typeof object[prop] === 'function' && prop.indexOf('_') !== 0 && prop !== 'constructor';
  });

  var federatable = {};
  federatedMethods.forEach(function(method) {
    federatable[method] = function(args) {
      // the arguments arrive as a hash, so make them into an array
      var _args = Object.keys(args).map(function(k) {return args[k]});
      // invoke the real object method
      object[method].apply(object, _args);
    }
  });

  // setup dnode to receive all public methods of the object
  var d = dnode(federatable);
  // tell the client that we are ready
  ws.send('ready');
  // start streaming rpc
  var wsStream = WebSocketStream(ws);
  wsStream.pipe(d).pipe(wsStream);
  return d;
};

/**
 * Accept or reject a connecting web socket. the connecting web socket must contain a valid secret query param
 * @param info
 * @returns {*|boolean}
 * @private
 */
FederationServer.prototype._verifyClient = function(info) {
  var parsed = url.parse(info.req.url, true);
  return parsed.query && (parsed.query.secret === this.options.secret);
};

module.exports = exports = FederationServer;