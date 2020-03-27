const fs = require("fs");
const tmi = require("tmi.js");
const logger = require("tmi.js/lib/logger");

const config = JSON.parse(fs.readFileSync("app.cfg.json"));
const moderators = JSON.parse(fs.readFileSync("moderators.json"))
let commands = JSON.parse(fs.readFileSync(config.commands));
let viewers = [];

var util = require('util');
var log_file = fs.createWriteStream(__dirname + '/debug.log', {flags : 'w'});
var log_stdout = process.stdout;

var lastuptime = 0; //global variable needed for uptime timer
var timer = 0;


console.log = function(d) { //
  log_file.write(util.format(d) + '\n');
  log_stdout.write(util.format(d) + '\n');
};

let client = new tmi.Client({
    identity: {
        username: config.username,
        password: config.password
    },
    channels: [config.channel],
    options: {
        debug: true
    },
    connection: {
        reconnect: true,
        secure: true
    }
});

client.connect();

process.on("SIGINT", () => {
    client.disconnect()
        .then(() => {
            fs.writeFileSync(
                config.commands,
                JSON.stringify(commands.sort((a, b) => {
                    if (a.name < b.name) { return -1; }
                    else if (a.name > b.name) { return 1; }
                    else { return 0; }
                }), null, 4) + "\n",
                () => {
                    logger.warn(`Could not save commands to ${config.commands}!`);
                }
            );

            process.exit();
        });
});


listeners(client);

followersubscribe(); //renew subscription at starting.

setInterval(function(){ //renew the follower subscribtion every 30 second
	followersubscribe();
}, 30000);



client.on("chat", (channel, userstate, commandMessage, self) => {
    if (self) { return; };
    if (!config.verbose) { return; };

    /*if (!viewers.includes(userstate.username)) {
        viewers.push(userstate.username);
        client.say(channel, `Üdvözlünk a streamen, ${userstate["display-name"]} HeyGuys`);
    }*/

    if (!commandMessage.startsWith("!")) { return; };
	//if (userstate.username != "unnamedman22") {return; }; //Only answers to me
	
    let commandName = commandMessage.split(/\s/)[0].toLowerCase();
    commandMessage = commandMessage.slice(commandName.length).trim();

    switch (commandName) {
        case ("!commands"):
            (() => {
                let names = "!commands !uptime"
                    .split(/\s/)
                    .concat(
                        commands.map(c => {
                            if (c.active) { return c.name; }
                            else { return null; }
                        }).filter(name => {
                            return name !== null
                        })
                    ).sort()
                    .join(", ");

                client.say(channel, `@${userstate.username} A következő parancsok érhetőek el: ${names}`);
            })();
            break;
        case ("!add"):
            (() => {
				if (!modcheck(userstate.username))
					return;
                const usage = `@${userstate.username} Használat: !add "parancs" "üzenet"`;

                if (!commandMessage) { client.say(channel, usage); return; }

                commandName = commandMessage.split(/\s/)[0];
                if (!commandName) { client.say(channel, usage); return; }

                commandMessage = commandMessage.substr(commandName.length);
                if (!commandMessage) { client.say(channel, usage); return; }

                commandName = (commandName.startsWith("!") ? "" : "!") + commandName;
                commandName = commandName.toLowerCase();

                let commandNames = "!commands !add !remove"
                    .split(/\s/)
                    .concat(
                        commands.map(command => {
                            if (!command.active) { return null; }
                            return command.name;
                        }).filter(name => {
                            return name !== null
                        })
                    );

                if (commandNames.includes(commandName)) {
                    client.say(channel, `@${userstate.username} A parancs "${commandName}" már létezik!`); return;
                }

                commands.push({
                    name: commandName,
                    message: commandMessage,
                    author: userstate.username,
                    active: true,
					lastused: 0
                });

                client.say(channel, `@${userstate.username} Parancs "${commandName}" hozzáadva!`);
            })();
            break;
        case ("!remove"):
            (() => {
				if (!modcheck(userstate.username))
					return;
                commandMessage = commandMessage.split(/\s/)[0];
                if (!commandMessage) { client.say(channel, `@${userstate.username} Használat: !remove "parancs"!`); return; }

                commandMessage = (commandMessage.startsWith("!") ? "" : "!") + commandMessage.toLowerCase();

                if ("!commands !add !remove".split(/\s/).includes(commandMessage)) {
                    client.say(channel, `@${userstate.username} A parancs "${commandMessage}" nem törölhető!`);
                    return;
                }

                let command = commands
                    .filter(c => {
                        return c.name === commandMessage && c.active;
                    });

                if (command.length <= 0) {
                    // client.say(channel, `@${userstate.username} The command ${commandMessage} does not exist!`);
                    return;
                }

                command = command[0];

                /*if (command.author !== userstate.username) {
                    client.say(channel, `@${userstate.username} A parancs "${commandMessage}" nem törölhető, mert nem te vagy a tulajdonosa!`);
                    return;
                }*/

                commands = commands
                    .filter(c => {
                        return c.name !== command.name;
                    });

                client.say(channel, `@${userstate.username} A parancs "${commandMessage}" törölve!`);
            })();
            break;
		case ("!uptime"):
			if(modcheck(userstate.username) || !isused(lastuptime)){
				var url = 'https://api.twitch.tv/helix/streams?user_id=' + config.broadcasterid;
				api_get(url ,function(ret){
					var uptimemessage;
					try{
						started = Date.parse(ret.data[0].started_at);
						var d = new Date;
						var now = d.getTime();
						var runtime = now - started;
						var uptimehours = Math.floor(runtime / 1000 / 60 / 60);
						var uptimeminutes = Math.floor(runtime / 1000 / 60 % 60);
						if (uptimehours == 0){
							uptimemessage = 'Már ' + uptimeminutes + ' perce pörög az adás!';
						}else{
							uptimemessage = 'Már ' + uptimehours + ' órája és ' + uptimeminutes + ' perce pörög az adás!';
						}
					}catch(err){
						uptimemessage = config.channelname + ' jelenleg nem közvetít. Nézz vissza később!';
					}
					client.say(channel, uptimemessage);
				});
			}
				break;
		case ("!clip"):
			var url = 'https://api.twitch.tv/helix/clips?broadcaster_id=' + config.broadcasterid;
			api_post(url, function(ret){
				console.log(ret);
				ret_url = ret.data[0].edit_url;
				ret_url = ret_url.replace('/edit', '');
				client.say(channel, ret_url);
			});
			break;
		case ("!ping"):
			client.say(channel, "pong!");
			break;
        default:
            (() => {
                let command = commands
                    .filter(c => {
                        return c.name === commandName && c.active;
                    });
                if (command.length <= 0) { return; }
                command = command[0];
				if(!modcheck(userstate.username)){
				
					if(isused(command.lastused)){
						return;
					}
					else{
						client.say(channel, `${command.message}`);
						var d = new Date();
						var now = d.getTime();
						command.lastused = now;
					}
				}
				else //in case of the chatter is mod, bypass the timer
				{
					client.say(channel, `${command.message}`);
					var d = new Date();
					var now = d.getTime();
					command.lastused = now;
				}
            })();
            break;
    }
});

function modcheck(username){
	var i = 0
	while (i < moderators.length) //Looping through modlist
		{
			if (moderators[i].name == username)
				return true;
			i++;
		}
	return false;
}

function isused(time){ //return true if time+10000 < getTime (10sec delay checker)
	console.log("isused triggered with time: " + time);
	var d = new Date();
	now = d.getTime();
	console.log("Current time: " + now);
	if ((time+10000) >= now){
		return true;
	}
	else
		return false;
}

function api_get(url, callback){
	var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
	const Http = new XMLHttpRequest();
	const clientid = config.clientid;
	const token = config.token;
	Http.open('GET', url);
	Http.setRequestHeader('Client-ID', clientid);
	Http.setRequestHeader('Authorization', token);
	Http.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200){
			console.log('Succesfull api request');
			var ret = JSON.parse(Http.responseText);
			if (callback) callback(ret);
		}
	}
	Http.send();
}

function api_post(url, callback){
	var ready = false;
	var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
	const Http = new XMLHttpRequest();
	const clientid = config.clientid;
	const token = config.token;
	Http.open('POST', url, true);
	Http.setRequestHeader('Client-ID', clientid);
	Http.setRequestHeader('Authorization', token);
	Http.onreadystatechange = function() {
		if (this.readyState == 4 && (this.status == 200 || this.status == 202) && ready == false){
			console.log('Succesfull api request');
			console.log(this.status);
			var ret = JSON.parse(Http.responseText);
			ready = true;
			if (callback) callback(ret);
			
		}
	}
	Http.send(body);
}

function followersubscribe(){
	var json = '{"hub.callback":"' + config.callback + '","hub.mode":"subscribe","hub.topic":"https://api.twitch.tv/helix/users/follows?first=1&to_id=' + config.broadcasterid + '","hub.lease_seconds":"30"}';
	var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
	const Http = new XMLHttpRequest();
	const clientid = config.clientid;
	const token = config.token;
	Http.open('POST', 'https://api.twitch.tv/helix/webhooks/hub', true);
	Http.setRequestHeader('Content-Type', 'application/json');
	Http.setRequestHeader('Client-ID', clientid);
	Http.setRequestHeader('Authorization', token);
	/*Http.onreadystatechange = function() {
		if (this.readyState == 4 && (this.status == 200 || this.status == 202)){
			console.log('Succesfull api request');
			console.log(this.status);
			console.log(Http.responseText);
			
		}else{
			console.log(this.status);
			console.log(this.statusText);
		}
	}*/
	Http.send(json);
	console.log("Follower subscripe api request sent!")
}

function listeners(){
	const express = require( 'express' );
	const app = express();
	app.use( express.json() );

	app.post( '/', ( req, res ) => {
		//console.log( 'received webhook');
		var responsedata = req.body;
		if(responsedata.data[0].hasOwnProperty('followed_at')){
			var message = config.followalert_message;
			message = message.replace("___", responsedata.data[0].from_name);
			client.say('#bavaz1', message);
		}
		res.sendStatus( 200 );
	} );

	app.get( '/', ( req, res ) => {
		var url = req.url;
		var response = req.query;
		res.send(req.query['hub.challenge']);

		
	} );

	app.listen( 9000, () => console.log( 'Node.js server started on port 9000.' ) );
}