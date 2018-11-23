# Usage

How to use BusMQ

---

## Bus

The bus holds connections to one or more redis instances and is used
to create `queue`s, `channel`s, `service`s, `pubsub`s and `persistent` objects.

Node processes connecting to the same bus have access to and can use all queues, channels, services, pubsubs and persistent objects.

busmq uses by default [node_redis](https://github.com/mranney/node_redis) as the communication driver,
but ioredis may also be used, and in fact is mandatory when connecting to a cluster or sentinels.
Use the `driver` option when creating the bus instance.

If the redis server requires an authentication password, specify it in auth part of the redis connection url.

```
var Bus = require('busmq');

var bus = Bus.create({redis: ['redis://192.168.0.1:6379', 'redis://authpass@192.168.0.2:6379']});
// or specify the node-redis driver explicitly
// var bus = Bus.create({driver: 'node-redis', redis: ['redis://192.168.0.1:6379', 'redis://authpass@192.168.0.2:6379']});
// or specify the ioredis driver explicitly
// var bus = Bus.create({driver: 'ioredis', redis: ['redis://192.168.0.1:6379', 'redis://authpass@192.168.0.2:6379']});
// or specify the ioredis driver and cluster
// var bus = Bus.create({driver: 'ioredis', layout: 'cluster', redis: ['redis://192.168.0.1:6379', 'redis://authpass@192.168.0.2:6379']});
// or specify the ioredis driver and sentinels
// var bus = Bus.create({driver: 'ioredis', layout: 'sentinels', redis: ['redis://192.168.0.1:26379']});

bus.on('error', function(err) {
  // an error has occurred
});
bus.on('online', function() {
  // the bus is online - we can use queues, channels ans persistent objects
});
bus.on('offline', function() {
  // the bus is offline - redis is down...
});

// connect the redis instances
bus.connect();
```

### bus.create([options])

Create a new bus instance.

* `driver` -  specify the redis connection driver to use.
              This should be either `node-redis` or `ioredis`. The default is `node-redis`
* `layout` - specifies the type of redis setup to connect to. This should be one of `direct`, `cluster` or `sentinels`.
             The default is `direct`.
* `redis` -  specifies the redis servers to connect to. Can be a string or an array of string urls.
             A valid url has the form `redis://[auth_pass@]<host_or_ip>[:port]`.
* `redisOptions` - options to pass to the redis client on instantiation (defaults to {}). Driver specific.
* `federate` - an object defining federation options:
  * `server` -  an http/https server object to listen for incoming federation connections. if undefined then federation server will not be open
  * `path` - the path within the server to accept federation requests on
  * `urls` - an array of urls of the form `http[s]://<ip-or-host>[:port]` of other bus instances that this bus can federate to. default is an empty array.
  * `poolSize` - the number of web sockets to keep open and idle at all times to federated bus instances. default is 10.
  * `secret` - String|Function. if a string, the secret key to be shared among all bus instances that can federate to each other. if a function,
               the federver will call it to determine if the client is to be accepted (read more about the function
               behavior at https://github.com/websockets/ws/blob/master/doc/ws.md#optionsverifyclient). default is `notsosecret`.
* `logger` - the logger that the bus should use
* `logLevel` - specify the bus log level. possible values are 'error', 'warning', 'info', 'debug'. default is 'error'

Call `connect` to connect to the redis instances and to open the federation server.

### bus.withLog(log)

Attach a logger to the bus instance. Returns the bus instance.

### bus.debug(on)

Turn on or off printing of debug messages to the log. default is off.

### bus.connect()

Connect to the redis servers and start the federation server (if one was specified). Once connected to all redis instances, the `online` will be emitted.
If the bus gets disconnected from the the redis instances, the `offline` event will be emitted.

### bus.disconnect()

Disconnect from the redis instances and stop the federation server. Once disconnected, the `offline` event will be emitted.

### bus.isOnline()

Return `true` if the bus is online, `false` if the bus offline.

### bus.connection([key, cb])

Provide a connection to redis for the specified key. If the key already exists, then a connection to the correct redis is provided.
Otherwise, a connection to the correct redis is calculated from the key.

* `key` - the key to get the connection for. If not specified, return the first connection.
* `cb` - callback of the form `function(connection)`. Note that the provided connection object exposes redis commands directly.

### bus.queue(name)

Create a new [Queue](#queue) instance.

* `name` - the name of the queue.

Returns a new Queue instance. Call `queue.attach` before using the queue.

### bus.channel(name [, local, remote])

Create a new [Channel](#channel) instance.

* `name` - the name of the channel.
* `local` - \[optional\] specifies the local role. default is `local`.
* `remote` - \[optional\] specifies the remote role. default is `remote`.

### bus.pubsub(name)

Create a new [Pubsub](#pubsub) instance.

* `name` - the name of the pubsub channel.

Returns a new Pubsub instance.

### bus.service(name)

Create a new [Service](#service) object instance.

* `name` - the name of the service.

Returns a new Service instance. Call `service.serve` or `service.connect` before using service instance.

### bus.persistify(name, object, properties)

Create a new [Persistable](#persistable) object. Persistifying an object adds additional methods to the persistified object.
See the  API for more details.

* `name` - the name of the persisted object.
* `object` - the object to persistify.
* `properties` - an array of property names to persist.

### bus.promisify(object, methods)

Convert the specified methods in the provided object into promise based methods instead of callback based methods.
Once the methods are promisified, it is possible to use them with async/await.
Returns the object itself.

* `object` - the object to convert the specified methods to promise based
* `methods` - array of method names in the object to convert

### bus.federate(object, target)

Federate `object` to the specified `target` instead of hosting the object on the local redis servers.
Do not use any of the object API's before federation setup is complete.

* `object` - `queue`, `channel`, `service` or `persisted` objects to federate. These are created normally through `bus.queue`, `bus.channel`, `bus.service` and `bus.persistify`.
* `target` - the target bus url or an already open websocket to the target bus. The url has the form `http[s]://<location>[:<port>]`

### Bus Events

* `online` - emitted when the bus has successfully connected to all of the specified redis instances
* `offline` - emitted when the bus loses connections to the redis instances
* `error` - an error occurs

## Queue

A queue of messages.

Messages are pushed to the queue and consumed from it in they order that they were pushed.

Any number of clients can produce messages to a queue, and any number of consumers
can consume messages from a queue.

### Attach and Detach

Pushing messages and consuming them requires attaching to the queue.
The queue will remain in existence for as long as it has at least one client attached to it.

To stop using a queue, detach from it. Once a queue has no more clients attached, it will automatically expire
after a predefined ttl (also losing any messages in it).

### Producing Messages

```
var Bus = require('busmq');
var bus = Bus.create({redis: ['redis://127.0.0.1:6379']});
bus.on('online', function() {
  var q = bus.queue('foo');
  q.on('attached', function() {
    console.log('attached to queue');
  });
  q.attach();
  q.push({hello: 'world'});
  q.push('my name if foo');
});
bus.connect();
```

### Consuming Messages

```
var Bus = require('busmq');
var bus = Bus.create({redis: ['redis://127.0.0.1:6379']});
bus.on('online', function() {
  var q = bus.queue('foo');
  q.on('attached', function() {
    console.log('attached to queue. messages will soon start flowing in...');
  });
  q.on('message', function(message, id) {
    if (message === 'my name if foo') {
      q.detach();
    }
  });
  q.attach();
  q.consume(); // the 'message' event will be fired when a message is retrieved
});
bus.connect();
```

### Consumption Modes

There are three modes that messages can be consumed from a queue, with various degrees of
flexibility for each mode.

#### Unreliable Delivery

This is a *Zero-or-Once* message delivery mode, which is also the default mode.
Messages are consumed from the queue by one consumer only and will not be consumed again by that consumer or any other consumer.
This method of consumption is unreliable in a sense that if the consumer crashes before being able to
handle the message, it is lost forever.

```javascript
// consume with default settings
q.consume();

// this is the same as the default settings
q.consume({reliable: false, remove: true});
```

#### Reliable Delivery (Guarantee Delivery)

This is a *Once-or-More* message delivery mode, where it is guaranteed that messages will be delivered at least once.
Every consumed message enters a 'waiting for ack' state. The consumer should call 'ack' on a message in order to
mark it as handled. When the client issues an 'ack' on the message, the message
is permanently discarded from the queue and will not be consumed again.

If a client crashes when consuming in this mode, any messages that have not been ACKed will be delivered once more
when a client starts to consume again.

*Note:* This mode does not work well with multiple consumers. The behavior of multiple clients consuming in reliable
mode from the same queue is undefined.

```
// consume message reliably. message with id 3 is the last acked message
q.consume({reliable: true, last: 3});
```

#### Persistent Publish/Subscribe

This is a form of publish/subscribe, where all consumers receive all messages, even if they were not consuming at the time messages were
being pushed to the queue. A consumer can also specify the index of the message to start consuming from.

This is different than regular publish/subscribe since persistent publish/subscribe utilizes message queues to store
every published message, whereas regular publish/subscribe does not store published messages at any time.

Be careful using Persistent publish/subscribe for long periods of time and many messages since the messages are stored
in the queue for the entire existence of the queue. Misuse may lead to memory growth and an
eventual blowup of the redis server.

```
// consume message without removing them from the queue. start consuming from message at index 0.
q.consume({remove: false, index: 0});
```

### queue.attach([options])

Attach to the queue. If the queue does not already exist it is created.
Once attached, the `attached` event is emitted.

Options:

* `ttl` - duration in seconds for the queue to live without any attachments. default is 30 seconds.
* `discoverable` - whether this queue should notify all the federating buses connected to this bus about this queue. 
                   finding a discoverable queue is performed using the `queue.find#` method. default is false.

### queue.detach()

Detach from the queue. The queue will continue to live for as long as it has at least one attachment.
Once a queue has no more attachments, it will continue to exist for the predefined `ttl`, or until it
is attached to again.

### queue.push(message[, callback])

Push a message to the queue. The message can be a JSON object or a string. 
The message will remain in the queue until it is consumed by a consumer.

* `message` - the message to push
* `callback` - invoked after the message was actually pushed to the queue. receives `err` and the `id` of the pushed message

### queue.consume([options])

Start consuming messages from the queue.
The `message` event is emitted whenever a message is consumed from the queue.

Options:
* `max` if specified, only `max` messages will be consumed from the queue. If not specified,
messages will be continuously consumed as they are pushed into the queue.
* `remove` - `true` indicates to remove a read message from the queue, and `false` leaves it in the queue so that it may be read once more. default is `true`.
*Note*: The behavior of mixing consumers that remove messages with consumers that do not remove messages from the same queue is undefined.
* `reliable` - applicable only if `remove` is `true`. indicates that every consumed message needs to be ACKed in order not to receive it again in case of
calling `consume` again. see `queue.ack` for ack details. default is `false`.
* `last` - applicable only if `reliable` is `true`. indicates the last message id that was ACKed so that only messages with higher id's should be received.
if any messages still exist in the queue with id's lower than `last` they will be discarded.
this behaves exactly like calling `queue.ack` with the last id before starting to consume. default is 0.

### queue.ack(id[, callback])

Specifies that the message with the specified id, and all messages with lower id's, can safely be discarded so that
they should never be consumed again. Ignored if not consuming in reliable mode.

* `id` - the message id to ack
* `callback` - invoked after the message was actually acked. receives `err`.

### queue.isConsuming([callback])

Returns `true` if this client is consuming messages, `false` otherwise.

* `callback` - receives `err` and the consuming state

### queue.stop()

Stop consuming messages from the queue.

### queue.close()

Closes the queue and destroys all messages. Emits the `closed` event once it is closed.

### queue.flush([callback])

Empty the queue, removing all messages.

* `callback` - invoked after the queue was flushed. receives `err`.

### queue.exists([callback])

Checks if the queue exists in the local bus.

* `callback` - receives `err` and `result` with a value of `true` if the queue exists, `false` otherwise

### queue.find([callback])

Checks if the queue already exists in the local bus or a federated bus. Note that a queue can only be found
if the federated bus has announced its existence to the federating buses. This is something that happens periodically
during the lifecycle of the queue, where the frequency depends on the ttl of the queue.
Normally this method would be called before calling `queue.attach`.

* `callback` - receives `err` and the `location` of the queue. 
   if the queue exists locally, `location` will be set to `local`.
   if the queue exists in a federated bus, `location` will be set to the url of the federated bus.
   if the queue is not found, `location` is set to `null`.

### queue.count([callback])

Get the number if messages in the queue.

* `callback` - receives `err` and the number of messages in the queue

### queue.ttl([callback])

Get the time in seconds for the queue to live without any attachments.

* `callback` - receives `err` and the ttl in seconds

### queue.metadata(key [, value][, callback])

Get or set arbitrary metadata on the queue.
Will set the metadata `key` to the provided `value`, or get the current value of the key if the `value` parameter is not provided.

* `key` - the metadata key to set or get
* `value` - \[optional\] the value to set on the key.
* `callback` - receives `err` as the first argument. if setting a metadata value, it is called with no further arguments.
if retrieving the value, it is called with the retrieved value.

### queue.pushed([callback])

Returns the number of messages pushed by this client to the queue

* `callback` - receives `err` and the number of pushed messages

### queue.consumed([callback])

Returns the number of messages consumed by this client from the queue

* `callback` - receives `err` and the number of consumed messages

### queue.promisify()

Convert the elligible methods to promise based methods instead of callback based. 
Returns the same object so that the following can be done: 

```javascript
var queue = bus.queue('foo').promisify();
```

### Queue Events

* `attaching` - emitted when starting to attach
* `attached` - emitted when attached to the queue. The listener callback receives `true` if the queue already exists
and `false` if it was just created.
* `detaching` - emitted when starting to detach
* `detached` - emitted when detached from the queue. If no other clients are attached to the queue, the queue will remain alive for the `ttl` duration
* `consuming` - emitted when starting or stopping to consume messages from the queue. The listener callback will receive `true`
if starting to consume and `false` if stopping to consume.
* `message` - emitted when a message is consumed from the queue. The listener callback receives the message as a string and the id of the message as an integer.
* `error` - emitted when some error occurs. The listener callback receives the error.

## Channel

A bi-directional channel for peer-to-peer communication. Under the hood, a channel uses two message queues,
where each peer pushes messages to one queue and consumes messages from the other queue.
It does not matter which peer connects to the channel first.

Each peer in the channel has a role. For all purposes roles are the same, except that the roles determine to which
queue messages will be pushed and from which queue they will be consumed. To peers to communicate over the channel, they must have opposite roles.

By default, a channel uses role `local` to consume messages and `remote` to push messages.
Since peers must have opposite roles, if using the default roles, one peer must call `channel.listen` and the other peer must call `channel.connect`.

It is also possible to specify other roles explicitly, such as `client` and `server`.
This enables specifying the local role and the remote role, and just connecting the channel without calling `listen`.
Specifying roles explicitly may add to readability, but not much more than that.

A channel supports the same consumption modes as a queue does. See [Consumption Modes](#consumption-modes) for details.

### Using a channel (default roles)

Server endpoint:

```javascript
bus.on('online', function() {
  var c = bus.channel('bar'); // use default names for the endpoints
  c.on('connect', function() {
    // connected to the channel
  });
  c.on('remote:connect', function() {
    // the client is connected to the channel
    c.send('hello client!');
  });
  c.on('message', function(message) {
    // received a message from the client
  });
  c.listen(); // reverse the endpoint roles and connect to the channel
});
```

Client endpoint:

```javascript
bus.on('online', function() {
  var c = bus.channel('bar'); // use default names for the endpoints
  c.on('connect', function() {
    // connected to the channel
  });
  c.on('remote:connect', function() {
    // the server is connected to the channel
    c.send('hello server!');
  });
  c.on('message', function(message) {
    // received a message from the server
  });
  c.connect(); // connect to the channel
});
```

### Using a channel (explicit roles)

Server endpoint:

```javascript
bus.on('online', function() {
  // local role is server, remote role is client
  var c = bus.channel('zoo', 'server', 'client');
  c.on('connect', function() {
    // connected to the channel
  });
  c.on('remote:connect', function() {
    // the client is connected to the channel
    c.send('hello client!');
  });
  c.on('message', function(message) {
    // received a message from the client
  });
  c.connect(); // connect to the channel
});
```

Client endpoint:

```javascript
bus.on('online', function() {
  // notice the reverse order of roles
  // local role is client, remote role is server
  var c = bus.channel('zoo', 'client', 'server');
  c.on('connect', function() {
    // connected to the channel
  });
  c.on('remote:connect', function() {
    // the server is connected to the channel
    c.send('hello server!');
  });
  c.on('message', function(message) {
    // received a message from the server
  });
  c.connect(); // connect to the channel
});
```

### channel.connect()

Connects to the channel. The `connect` event is emitted once connected to the channel.

### channel.attach()

Alias to `channel.connect()`

### channel.listen()

Connects to the channel with reverse semantics of the roles. 
The `connect` event is emitted once connected to the channel.

### channel.send(message[, callback])

Send a message to the peer. The peer does need to be connected for a message to be sent.

* `message` - the message to send
* `callback` - invoked after the message was actually pushed to the channel. receives `err` and the `id` of the pushed message

### channel.sendTo(endpoint, message[, callback])

Send a message to the the specified endpoint. There is no need to connect to the channel with `channel.connect` or `channel.listen`.

* `endpoint` - the target endpoint to receive the message
* `message` - the message to send
* `callback` - invoked after the message was actually pushed to the channel. receives `err` and the `id` of the pushed message

### channel.disconnect()

Disconnect from the channel. The channel remains open and a different peer can connect to it.

### channel.detach()

Alias to `channel.disconnect()`

### channel.end()

End the channel. No more messages can be pushed or consumed. This also caused the peer to disconnect from the channel and close the message queues.

### channel.ack(id[, callback])

See [queue.ack](#queueackid) for details

### channel.isAttached([callback])

Returns `true` if connected to the channel, `false` if not connected.

### channel.promisify()

Convert the elligible methods to promise based methods instead of callback based. 
Returns the same object so that the following can be done: 

```javascript
var channel = bus.channel('foo').promisify();
```

### Channel Events

* `connect` - emitted when connected to the channel
* `remote:connect` - emitted when a remote peer connects to the channel
* `disconnect` - emitted when disconnected from the channel
* `remote:disconnect` - emitted when the remote peer disconnects from the channel
* `message` - emitted when a message is received from the channel. The listener callback receives the message as a string.
* `end` - emitted when the remote peer ends the channel
* `error` - emitted when an error occurs. The listener callback receives the error.

## Persistable

It is possible to persist arbitrary objects to the bus.
A persistable object defines a set of properties on the object that are tracked for modification. When
saving a dirty object (where dirty means that some tracked properties have changed) only those dirty properties are
persisted to the bus. Loading a persistable object reads all of the persisted properties.

```
bus.on('online', function() {
  var object = {field: 'this field is not persisted'};
  var p = bus.persistify('obj', object, ['foo', 'bar', 'zoo']);
  p.foo = 'hello';
  p.bar = 1;
  p.zoo = true;
  p.save(function(err) {
    // foo, bar and zoo fields have been saved
  });

  p.foo = 'world';
  p.save(function(err) {
    // only foo has been saved
  });

  // load the persistified properties
  var p2 = bus.persistify('obj', {}, ['foo', 'bar', 'zoo']);
  p2.load(function(err, exists) {
    // exists == true
    // p2.foo == 'world'
    // p2.bar == 2
    // p2.zpp == true'
  });
});
```

### persistable.save([callback])

Save all the dirty properties. The dirty properties are marked as not dirty after the save completes.

* `callback` - called when the save has finished. receives `err` if there was an error.

### persistable.load([callback])

Load all the tracked properties. All properties are marked as not dirty after the load completes.

* `callback`  - called when the load has finished. receives `err`, `exists` and `id`
where `exists` is true if the persisted object was found in the bus and `id` is the id of the object whose data was searched.

### persistable.persist(ttl)

Start a periodic timer to continuously mark the persisted object as being used.

* `ttl` specifies the number of seconds to keep the object alive in the bus.

### persistable.unpersist()

Stop the periodic timer. This will cause object to expire after the defined ttl provided in the persist method.

## Service

A service endpoint for implementing microservice architectures.

A service object can either be serving requests or making requests, but it can't do both.

Requests to a service have the request/response form - a requester sends a request to the service, the service
handles the request and then sends a reply (or error) back to the requester. 

Replies can be streamed instead of sending them as a single response. This is useful in cases where the respose is large.

Any number of service objects can handle requests, as well as any mumber of clients 
can make requests to the service. When there are multiple service objects serving the same service enpoint,
only one will ever receive any single request

Services do not operate in reliable mode, that is, if a request is being handled but the service
handler crashes, the request is lost.

### Making Requests

```
var Bus = require('busmq');
var bus = Bus.create({redis: ['redis://127.0.0.1:6379']});
bus.on('online', function() {
  // create a service object to make requests
  var requester = bus.service('foo');
  // connect to the service so we can make requests
  requester.connect(function() {
    console.log('connected to the service');
  });

  // make a request and receive a reply
  requester.request({hello: 'world'}, function(err, reply) {
    console.log('the service replied with ' + reply.thisis);
  });

  // make a request and receive a streaming reply
  requester.request({hello: 'world'}, {streamReply: true}, function(err, reply) {
    // reply is a Readable stream
    reply.on("data", function(data) {
      console.log('the service replied with ' + data.thisis);
    });
    reply.on("end", function() {
      // no more data in the reply
    });
  });

  // this request does not have a reply
  requester.request({hello: 'again'});
});
bus.connect();
```

### Handling Requests

```
var Bus = require('busmq');
var bus = Bus.create({redis: ['redis://127.0.0.1:6379']});
bus.on('online', function() {
  // create a service object to handle requests
  var handler = bus.service('foo');

  // handle requests
  handler.on('request', function(request, reply) {
    console.log('Hey! a new request just got in: ' + request.hello);
    // send the reply back to the requester
    reply(null, {thisis: 'my reply'});
  });

  // handle requests with a streaming response
  handler.on('request', function(request, reply) {
    console.log('Hey! a new request just got in: ' + request.hello);
    // stream the reply back to the requester
    var st = reply.createWriteStream();
    st.write({thisis: 'a first chunk'});
    st.write({thisis: 'another chunk'});
    st.write({thisis: 'last one!'});
    st.end();
  });

  // start serving requests
  handler.serve(function() {
    console.log('serving. requests will soon start flowing in...');
  });
});
bus.connect();
```

### service.serve([callback])

Start serving requests made to the service. The `request` event will be fired when a new request arrives.

* `callback` - one time listener for the `serving` event

The `request` event callback must have the form `function(request, reply)` where:

* `request` - the request data that the requester has sent
* `reply` - a function of the form `function(err, reply)` to send the reply back to the requester. 
            A service provider MUST invoke the `reply()` function to indicate the end of the request 
            processing even if no reply is sent back to the requester.

### service.connect([options, callback])

Connect to the service to start making requests.

* `options` - connection options:
  * `reqTimeout` - default request timeout for all requests
* `callback` - one time listener for the `connected` event

### service.disconnect([gracePeriod])

Disconnect from the service. This should be called by both a service provider and a service consumer.
When in serving mode, no new requests will arrive.
When in requester mode, no new requests can be made.

* `gracePeriod` - number of milliseconds to wait for any currently in-flight requests to finish handling. 
                  
### service.request(data[, options [, callback]]);

Make a request to the service. The `connect()` method must be called before making any requests.

* `data` - the request data to send to the service. Can be a string or an object.
* `options` - request options:
  * `reqTimeout` - request timeout, overriding the default request timeout
  * `streamReply` - the `reply` received in the callback will be a [Readable stream](https://nodejs.org/api/stream.html#stream_class_stream_readable) instead of the actual response.
* `callback` - a callback of the form `function(err, reply)` that will be invoked with the reply from the service. 
               If ommitted, no reply will be sent (or received) from the service.

### service.promisify()

Convert the elligible methods to promise based methods instead of callback based. 
Returns the same object so that the following can be done: 

```javascript
var service = bus.service('foo').promisify();
```

### Service Events

* `serving` - emitted when the service will start receiving `request` events
* `connected` - emitted once connected to the service as a consumer
* `disconnect` - emitted when disconnected from the service
* `request` - emitted when a request is received from a requester. The event handler should have the form `(request, reply)`, where `request` is the data the requester sent, and `reply` is a function that the service handler invokes once handling is done. It is also possible to call `reply.createWriteStream()` to stream the reply back to the requester.
* `error` - emitted when an error occurs. The listener callback receives the error.

## Publish/Subscribe

A plain old publish/subscribe channel. These channels are not backed by queues, so any subscriber not subscribed at the
time a message is published will not receive the message.

Publish/Subscribe channel are always created on the first redis server in the list of redis servers
the bus is connected to. The reason for this is the time it would take to locate a publish/subscribe channel via the
redis api were the channels distributed between all redis servers (it's O(N) where N is the number of subscribers).

```
bus.on('online', function() {
  var s = bus.pubsub('my pubsub channel');
  s.on('message', function(message) {
    // received message 'hello world' on subscribed channel
  });
  s.subscribe();

  var p = bus.pubsub('my pubsub channel');
  p.publish('hello world');
});
```

### pubsub.publish(message[, callback])

Publishes a message on the pubsub channel. Only currently subscribed clients will receive the message.

* `message` - the message to publish
* `callback` - invoked after the message was actually published. receives `err` if there was an error. _note: starting
from version 1.5.0, the callback no longer receives the number of subscribers that received the message._

### pubsub.subscribe()

Subscribes to message in the pubsub channel. Once a message is received, the `message` event will be emitted.

### pubsub.unsubscribe()

Unsubscribes from messages on the pubsub channel. Messages can still be published using the `publish` method.

### pubsub.isSubscribed()

Returns `true` if subscribed to messages from the pubsub channel, `false` if not.

### pubsub.promisify()

Convert the elligible methods to promise based methods instead of callback based. 
Returns the same object so that the following can be done: 

```javascript
var pubsub = bus.pubsub('foo').promisify();
```

### Pubsub Events

* `subscribed` - emitted when subscribed to messages on the pubsub channel
* `unsubscribed` - emitted when unsubscribing from the pubsub channel
* `message` - emitted when a message is received from the pubsub channel. The listener callback receives the message as a string.
* `error` - emitted when an error occurs. The listener callback receives the error.

## Federation

It is sometimes desirable to setup bus instances in different locations, where redis
servers of one location are not directly accessible to other locations. This setup is very common
when building a bus that spans several data centers, where each data center is isolated behind a firewall.

Federation enables using queues, channels and persisted objects of a bus without access to the redis servers themselves.
When federating an object, the federating bus uses web sockets to the target bus as the federation channel,
and the federated bus manages the object on its redis servers on behalf of the federating bus.
The federating bus does not host the federated objects on the local redis servers.

Federation is done over web sockets since they are firewall and proxy friendly.

The federating bus utilizes a simple pool of always-connected web sockets. When a bus is initialized, it
spins up an fixed number of web sockets that connect to federated bus instances. When federating an object, the bus
selects a web socket from the pool and starts federating the object over it.

The API and events of a federated objects are exactly the same as a non-federated objects. This is achieved
using the [dnode](https://github.com/substack/dnode) module for RPCing the object API.

#### Opening a bus with a federation server

```javascript
// this server is running on 192.168.0.1
var http = require('http');
var httpServer = http.createServer(); // create the http server to serve as the federation server. you can also use express if you like...
httpServer.listen(8881);
var Bus = require('busmq');
var options = {
  redis: 'redis://127.0.0.1', // connect this bus to a local running redis
  federate: { // also open a federation server
    server: httpServer,  // use the provided http server as the federation server
    secret: 'mysecret',   // a secret key for authorizing clients
    path: '/my/fed/path' // the federation service is accessible on this path in the server
  }
};
var bus = Bus.create(options);
bus.on('online', function() {
  // the bus is now ready to receive federation requests
});
bus.connect();
```

#### Federating a queue

```javascript
var Bus = require('busmq');
var options = {
  federate: { // connect to a federate bus
    poolSize: 5, // keep the pool size with 5 web sockets
    urls: ['http://192.168.0.1:8881/my/fed/path'],  // pre-connect to these urls, 5 web sockets to each url
    secret: 'mysecret'  // the secret key to authorize with the federation server
  }
};
var bus = Bus.create(options);
bus.on('online', function() {
 // federate the queue to a bus located at a different data center
 var fed = bus.federate(bus.queue('foo'), 'http://192.168.0.1:8881/my/fed/path');
 fed.on('ready', function(q) {
   // federation is ready - we can start using the queue
   q.on('attached', function() {
     // do whatever
   });
   q.attach();
 });
});
bus.connect();
```

#### Finding a queue

It is possible to find a queue that exists in a federated bus. 
Note that a queue can only be found if the federated bus has announced its existence to the federating buses. 
This is something that happens periodically during the lifecycle of the queue, where the announcement frequency  
depends on the ttl of the queue (frequency is ttl/3)

##### Making a queue discoverable
```javascript
 // a queue named 'foo' is created in the federated bus at http://192.168.0.1:8881 and is made discoverable
 var queue = bus.queue('foo');
 queue.attach({discoverable: true});
```

##### Finding the discoverable queue

```javascript
  // find the queue named 'foo'
  var queue = bus.queue('foo');
  queue.find(function(err, location) {
    console.log(location === 'http://192.168.0.1:8881/my/fed/path'); // will print 'true'
    // we can now federate the queue
    var fed = bus.federate(queue, location);
  });
```

#### Federating a channel

```javascript
var Bus = require('busmq');
var options = {
  federate: { // connect to a federate bus
    poolSize: 5, // keep the pool size with 5 web sockets
    urls: ['http://192.168.0.1:8881/my/fed/path'],  // pre-connect to these urls, 5 web sockets to each url
    secret: 'mysecret'  // the secret key to authorize with the federation server
  }
};
var bus = Bus.create(options);
bus.on('online', function() {
 // federate the channel to a bus located at a different data center
 var fed = bus.federate(bus.channel('bar'), 'http://192.168.0.1:8881/my/fed/path');
 fed.on('ready', function(c) {
   // federation is ready - we can start using the channel
   c.on('message', function(message) {
     // do whatever
   });
   c.attach();
 });
});
bus.connect();
```

#### Federating a persistable object

```javascript
var Bus = require('busmq');
var options = {
  federate: { // connect to a federate bus
    poolSize: 5, // keep the pool size with 5 web sockets
    urls: ['http://192.168.0.1:8881/my/fed/path'],  // pre-connect to these urls, 5 web sockets to each url
    secret: 'mysecret'  // the secret key to authorize with the federation server
  }
};
var bus = Bus.create(options);
bus.on('online', function() {
 // federate the persistent object to a bus located at a different data center
 var fed = bus.federate(bus.persistify('bar', object, ['field1', 'field2']), 'http://192.168.0.1:8881/my/fed/path');
 fed.on('ready', function(p) {
   // federation is ready - we can start using the persisted object
   p.load(function(err, exists) {
     // do whatever
   });
 });
});
bus.connect();
```

#### Federating a pubsub

```javascript
var Bus = require('busmq');
var options = {
  federate: { // also connect to a federate bus
    poolSize: 5, // keep the pool size with 5 web sockets
    urls: ['http://192.168.0.1:8881/my/fed/path'],  // pre-connect to these urls, 5 web sockets to each url
    secret: 'mysecret'  // the secret ket to authorize with the federation server
  }
};
var bus = Bus.create(options);
bus.on('online', function() {
 // federate the channel to a bus located at a different data center
 var fed = bus.federate(bus.pubsub('bar'), 'http://192.168.0.1:8881/my/fed/path');
 fed.on('ready', function(p) {
   // federation is ready - we can start using pubsub
   p.on('message', function(message) {
     // do whatever
   });
   p.subscribe();
   p.publish('foo bar');
 });
});
bus.connect();
```

### federate.close(disconnect)

Close the federation object.

* `disconnect` - true to disconnect the underlying websocket

#### Federate Events

* `ready` - emitted when the federation setup is ready. The callback receives the bus object to use.
* `unauthorized` - incorrect secret key was used to authenticate with the federation server
* `reconnecting` - the federation connection was disconnected and is now reconnecting
* `reconnected` - the federation connection has successfully reconnected
* `close` - the federation connection closed permanently
* `error` - some error occurred. the callback receives the `error` message

## Browser Support

Browser support is achieved through the use of federation to the bus server over native browser websockets. 
The following API is only available from a browser connecting to a federation server.
It enables the use of queues, channels and persisted objects.

### How to Build

Generating the latest `busmq.js` and `busmq.min.js` files requires cloning the git repo.

```bash
git clone https://github.com/capriza/node-busmq.git
cd node-busmq
npm install
npm run browser
```

#### Usage

```javascript
<script src="busmq.min.js"></script>

<script>
  // connect to the bus running a federation server on port 8080 and with secret 'notsosecret'
  var bus = busmq('ws://localhost:8080/', 'notsosecret');

  // create a queue object named 'foo'.
  // the queue will be created in the bus and the callback will be invoked when the queue is ready
  bus.queue('foo', function(err, q) {
    if (err) {
      console.log('bus: error ' + err);
      return;
    }
    console.log('bus: q ready');
    q.on('attached', function() {
      console.log('bus: queue attached');
      // push 5 messages to the queue
      for (var i = 0; i < 5; ++i) {
        q.push('message number ' + i);
      }
    });
    q.on('message', function(message, id) {
      // 5 messages should be received
      console.log('got bus message ' + id + ': ' + message);
    });
    // attach to the queue and consume messages from it
    q.attach();
    q.consume();
  });
</script>
```

### busmq(url, secret)

Connect to the federation server a of running bus.
Returns a `Bus` object.

* `url` - the url of the bus federation server. the protocol must be `ws` or `wss`.
* `secret` - the federation server secret

### bus.queue(name, cb)

Create a federated `queue` object.

* `name` - queue name
* `cb` - callback invoked when the federated object is ready. the callback format is `function(err, queue)`.

### bus.channel(name, local, remote, cb)

Create a federated `channel` object.

* `name` - channel name
* `local` - local role
* `remote` - remote role
* `cb` - callback invoked when the federated object is ready. the callback format is `function(err, channel)`.

### bus.pubsub(name, cb)

Create a federated `pubsub` object.

* `name` - queue name
* `cb` - callback invoked when the federated object is ready. the callback format is `function(err, pubsub)`.

### bus.persistify(name, object, attributes, cb)

Create a federated `persistable` object.

* `name` - channel name
* `object` - the object to persistify
* `attributes` - object attributes to persist
* `cb` - callback invoked when the federated object is ready. the callback format is `function(err, persisted)`.