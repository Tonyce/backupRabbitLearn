var http = require('http');

http.createServer(function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/plain' });
	res.end("Hello World");
}).listen(3000, '127.0.0.1', function(){
	console.log("server start at 3000");
});