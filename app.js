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

                client.say(channel, `@${userstate.username} A következő parancsok elérhetőek: ${names}`);
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
				const request = require('request');
				request('http://decapi.me/twitch/uptime?channel=bavaz1', { json: true }, (err, body) => {
					if (err) { return console.log(err); }
					console.log(body.body);
					var uptime = body.body
					if(uptime == "bavaz1 is offline"){
						uptime = "bavaz1 közvetítése jelenleg offline!"
					}
					else {
						uptime = uptime.replace("minutes,", "perc");
						uptime = uptime.replace("seconds", "másodperc");
						uptime = uptime.replace("minute,", "perc");
						uptime = uptime.replace("minutes", "perc");
					}
					client.say(channel, uptime);
					var d = new Date();
					var ms = d.getTime();
					lastuptime = ms;
					});
				}

		/*case ("!teszt2"):
			console.log(moderators[1].name);
			console.log(moderators[0].name);
			console.log(moderators.length);*/
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
	console.log("Current time: " + now)
	if ((time+10000) >= now){
		return true;
	}
	else
		return false;
}
