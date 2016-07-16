#!/usr/bin/env node
var amqp = require('amqplib/callback_api');
var WebSocketServer = require('websocket').server;
var http = require('http');

global._MQConn = '';

amqp.connect('amqp://localhost', function(err, conn) {
    global._MQConn = conn;
    conn.on('close', function () {
        global._MQConn = '';
    })
});

var server = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(8080, function() {
    console.log((new Date()) + ' Server is listening on port 8080');
});

wsServer = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
  // put logic here to detect whether the specified origin is allowed.
    return true;
}

wsServer.on('request', function(request) {
    // if (!originIsAllowed(request.origin)) {
    //     // Make sure we only accept requests from an allowed origin
    //     request.reject();
    //     console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
    //     return;
    // }

    var connection = request.accept('echo-protocol', request.origin);
    // console.log((new Date()) + ' Connection accepted.');
    var id = request.resourceURL.path.replace('/', '');
    consumeToClient(connection, id);
    
    connection.on('message', function(message) {
        console.log("message", message);
        pushToMQ(message);
    });
    connection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});

//emit to mq
function pushToMQ (message) {
    // console.log(typeof message)
    var data = ''
    if (message.type === 'utf8') {
        data = message.utf8Data;
    } else if (message.type === 'binary') {
        data = message.binaryData;
    }
    data = JSON.parse(data)
    var _ch = ""
    var MQConn = global._MQConn;
    var ex = 'direct_message';
    var severity = `${data.to.id}`
    
    if (!MQConn) {
        console.log("MQConn closed");
        return;
    }

    message = JSON.stringify(message);
    if (_ch) {
        _ch.assertExchange(ex, 'direct', {durable: true});
        _ch.publish(ex, severity, new Buffer(message));
    }else {
        MQConn.createChannel(function(err, ch) {
            _ch = ch
            ch.assertExchange(ex, 'direct', {durable: true});
            ch.publish(ex, severity, new Buffer(message));
        });
    }
}

//consume mq
function consumeToClient (connection, id) {
    console.log(id);
    var MQConn = global._MQConn;
    
    if (!MQConn) {
        console.log("MQConn closed");
        return;
    }

    MQConn.createChannel(function(err, ch) {
        var ex = 'direct_message';
        var severity = `${id}`

        ch.assertExchange(ex, 'direct', {durable: true});

        ch.assertQueue('', {exclusive: true}, function(err, q) {

            ch.bindQueue(q.queue, ex, severity);
            ch.consume(q.queue, function(msg) {
                var message = msg.content.toString();
                    message = JSON.parse(message);
                console.log("consumeing", message);
                if (message.type === 'utf8') {
                    console.log('Received Message: ' + message.utf8Data);
                    connection.sendUTF(message.utf8Data);
                } else if (message.type === 'binary') {
                    console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
                    connection.sendBytes(message.binaryData);
                }
            }, {noAck: true});
        });
    });   
}