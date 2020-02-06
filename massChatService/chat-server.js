// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs");

var users = [];
var userIds = {};
var rooms = [];
var usersInRoom = {};
var roomPasswords = {};
var roomAdmins = {};
var bannedUsers = {};
var prevRoom = {};

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function (req, resp) {
	// This callback runs when a new connection is made to our HTTP server.
	fs.readFile("client.html", function (err, data) {
		// This callback runs when the client.html file has been read from the filesystem.
		if (err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);

var io = socketio.listen(app);
io.sockets.on("connection", function (socket) {

	socket.on('message_to_server', function (data) {
		io.sockets.in(socket.room).emit("updateChat", socket.username, { message: data["message"] }) // broadcast the message to other users
	});

	socket.on("newUser", function (data) {
		var username = data['username'];
		socket.username = username;
		users.push(username);
		userIds[username] = socket.id;
		prevRoom[socket.username] = null;
		// update the list of users in chat, client-side

		//io.sockets.emit('updateUsers', users);
		io.sockets.emit('updateRooms', { "listRooms": rooms, 'usersInRoom': usersInRoom });
	});

	socket.on('createRoom', function (data) {
		var room = data['roomName'];
		roomAdmins[room] = [];
		usersInRoom[room] = [];
		bannedUsers[room] = [];
		roomAdmins[room].push(socket.username);
		rooms.push(room);
		roomPasswords[room] = null;

		io.sockets.emit('updateRooms', { "listRooms": rooms, 'usersInRoom': usersInRoom });
	});

	socket.on('createPrivateRoom', function (data) {
		var room = data['roomName'];
		roomPasswords[room] = data['roomPassword'];

	})

	socket.on('joinRoom', function (data) {
		var room = data['roomName'];
		socket.room = room;
		var roomExists = false;
		var isBanned = false;
		var isAdmin = false;
		for (var u in rooms) {
			if (rooms[u] == room) {
				roomExists = true;
			}
		}
		for (var u in bannedUsers[socket.room]) {
			if (bannedUsers[socket.room][u] == socket.username) {
				isBanned = true;
			}
		}
		for (var u in roomAdmins[socket.room]) {
			if (roomAdmins[socket.room][u] == socket.username) {
				isAdmin = true;
			}
		}
		if (roomExists && !isBanned) {
			console.log(socket.username + ": " + prevRoom[socket.username]);
			if (prevRoom[socket.username] != null) {
				usersInRoom[prevRoom[socket.username]].splice(usersInRoom[prevRoom[socket.username]].indexOf(socket.username), 1);
				io.sockets.in(prevRoom[socket.username]).emit('updateChat', 'SERVER', { message: `${socket.username} has disconnected` });
				socket.leave(prevRoom[socket.username]);
			}
			usersInRoom[room].push(socket.username);
			prevRoom[socket.username] = room;
			socket.join(room);
			io.sockets.in(socket.room).emit('updateUsers', { 'users': usersInRoom[room] });
			io.sockets.in(socket.room).emit('updateChat', 'SERVER', { message: `${socket.username} has connected` });
			io.sockets.emit('updateRooms', { "listRooms": rooms, 'usersInRoom': usersInRoom });
			socket.emit('joinRoom', { 'joined': true, 'roomName': room, 'roomPass': roomPasswords[room], 'isAdmin': isAdmin });
		} else {
			socket.emit('joinRoom', { 'joined': false });
		}
	});

	socket.on("privateMessage", function (data) {
		var receiverInRoom = false;
		if (socket.room != null) {
			for (var u in usersInRoom[socket.room]) {
				if (usersInRoom[socket.room][u] == data["receiver"]) {
					receiverInRoom = true;
				}
			}
			if (receiverInRoom) {
				socket.to(userIds[data["receiver"]]).emit("privateMsg", socket.username, { message: data['message'] });
			}
		}
	})

	socket.on("disconnect", function (data) {
		if (socket.room != null) {
			usersInRoom[socket.room].splice(usersInRoom[socket.room].indexOf(socket.username), 1);
			io.sockets.in(socket.room).emit('updateChat', 'SERVER', { message: `${socket.username} has disconnected` });
			io.sockets.in(socket.room).emit('updateUsers', { 'users': usersInRoom[socket.room] });
			socket.leave(socket.room);
		}
	})

	socket.on("leaveRoom", function (data) {
		if (socket.room != null) {
			prevRoom[socket.username] = null;
			usersInRoom[socket.room].splice(usersInRoom[socket.room].indexOf(socket.username), 1);
			socket.leave(socket.room);
			if (data['kick']) {
				io.sockets.in(socket.room).emit('updateChat', 'SERVER', { message: `${socket.username} has been kicked` });
			} else {
				io.sockets.in(socket.room).emit('updateChat', 'SERVER', { message: `${socket.username} has disconnected` });
			}
			io.sockets.in(socket.room).emit('updateUsers', { 'users': usersInRoom[socket.room] });
			io.sockets.emit('updateRooms', { "listRooms": rooms, 'usersInRoom': usersInRoom });

		}
	})
	socket.on("kickUser", function (data) {
		var isAdmin = false;
		for (var u in roomAdmins[socket.room]) {
			if (roomAdmins[socket.room][u] == socket.username) {
				isAdmin = true;
			}
		}
		if (isAdmin) {
			var user = data['username'];
			var kickInRoom = false;
			var userInRoom = false;
			for (var u in usersInRoom[socket.room]) {
				if (usersInRoom[socket.room][u] == user) {
					kickInRoom = true;
				}
				if (usersInRoom[socket.room][u] == socket.username) {
					userInRoom = true;
				}
			}
			if (userInRoom && kickInRoom) {
				socket.to(userIds[user]).emit('kicked');
			}
		}
	})
	socket.on("banUser", function (data) {
		var isAdmin = false;
		for (var u in roomAdmins[socket.room]) {
			if (roomAdmins[socket.room][u] == socket.username) {
				isAdmin = true;
			}
		}
		if (isAdmin) {
			var user = data['username'];
			var banInRoom = false;
			var userInRoom = false;
			for (var u in usersInRoom[socket.room]) {
				if (usersInRoom[socket.room][u] == user) {
					banInRoom = true;
				}
				if (usersInRoom[socket.room][u] == socket.username) {
					userInRoom = true;
				}
			}
			if (userInRoom && banInRoom) {
				bannedUsers[socket.room].push(user);
				socket.to(userIds[user]).emit('banned');
			}
		}
	})

	socket.on('addRights', function (data) {
		roomAdmins[socket.room].push(data['username']);
		console.log(roomAdmins[socket.room]);
	})

	socket.on('inviteRoom', function (data) {
		var validUser = false;
		for (var u in users) {
			if (users[u] == data['username']) {
				console.log("HERE");
				validUser = true;
			}
		}
		if (socket.room != null && validUser) {
			console.log("THERE");
			socket.to(userIds[data['username']]).emit('sentInvite', { 'message': `You have been invited to ${socket.room}. Do you accept? (Y/N)`, 'room': socket.room });
		}
	})
});