"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class VoiceAssistant {
    constructor() {
        this.translations = this.loadTranslations();
        this.platforms = this.loadPlatforms();
        this.trackers = this.loadTracker();
    }
    handle(json, response) {
        //console.log(JSON.stringify(json));
        let output;
        const promise = new Promise((result, reject) => {
            let handled = false;
            let resp;
            this.platforms.forEach(platform => {
                //console.log(platform.platformId() + " = " + platform.isSupported(json));
                if (platform.isSupported(json)) {
                    console.log("Detected platform " + platform.platformId());
                    const input = platform.parse(json);
                    this.trackers.forEach(tracker => tracker.trackInput(input));
                    this.language = input.language.substr(0, 2);
                    output = this.reply(input);
                    console.log('> ' + input.message);
                    // TODO contact the messages to get two resulting for compatibility with other platforms
                    for (let i = 0; i < output.messages.length; i++) {
                        if (output.messages[i].platform === platform.platformId()) {
                            console.log('< ' + output.messages[i].debug());
                        }
                    }
                    console.log('  [' + output.suggestions.join('] [') + ']');
                    handled = true;
                    resp = platform.render(output);
                }
            });
            if (!handled) {
                reject(resp);
            }
            else {
                result(resp);
            }
        });
        promise.then((resp) => {
            output.messages.forEach((msg) => {
                if (msg.type === 'plain' && msg.platform === '*') {
                    output.message = msg.render();
                }
            });
            this.trackers.forEach(tracker => tracker.trackOutput(output));
            response.end(JSON.stringify(resp));
        });
        return promise;
    }
    loadTracker() {
        return [];
    }
    t(key, ...args) {
        let translation = this.translations[this.language][key];
        if (translation instanceof Array) {
            translation = translation[Math.floor(Math.random() * translation.length)];
        }
        const newArg = [translation];
        args.forEach(arg => newArg.push(arg));
        return VoiceAssistant.sprintf.sprintf.apply(this, newArg);
    }
    tr(key, ...args) {
        const array = this.t(key, args);
        return array[Math.floor(Math.random() * array.length)];
    }
    plainMessage(message) {
        return {
            platform: '*',
            type: 'plain',
            render: () => message,
            debug: () => message
        };
    }
    formattedMessage(message) {
        return {
            platform: '*',
            type: 'formatted',
            render: () => message,
            debug: () => message
        };
    }
    suggestion(label) {
        return {
            platform: '*',
            render: () => label,
            toString: () => label
        };
    }
}
VoiceAssistant.sprintf = require('sprintf-js');
exports.VoiceAssistant = VoiceAssistant;
class IOMessage {
    constructor(id, userId, sessionId, language, platform, time, intent, inputMethod, message, context) {
        this.id = id;
        this.userId = userId;
        this.sessionId = sessionId;
        this.platform = platform;
        this.language = language;
        this.time = time;
        this.intent = intent;
        this.inputMethod = inputMethod;
        this.message = message;
        this.context = context;
    }
}
exports.IOMessage = IOMessage;
class Input extends IOMessage {
    reply() {
        return new Output(this.id + '.reply', this.userId, this.sessionId, this.platform, this.language, this.intent, "", this.context);
    }
}
exports.Input = Input;
class Output extends IOMessage {
    constructor(id, userId, sessionId, platform, language, intent, message, context) {
        super(id, userId, sessionId, language, platform, new Date(), intent, InputMethod.text, message, context);
        this.messages = [];
        this.suggestions = [];
        this.expectAnswer = false;
    }
    addMessage(message) {
        this.messages.push(message);
    }
    addSuggestion(suggestion) {
        this.suggestions.push(suggestion);
    }
    setRetentionMessage(message) {
        this.retentionMessage = message;
    }
    setExpectAnswer(answerExpected) {
        this.expectAnswer = answerExpected;
    }
}
exports.Output = Output;
var InputMethod;
(function (InputMethod) {
    InputMethod[InputMethod["voice"] = 0] = "voice";
    InputMethod[InputMethod["text"] = 1] = "text";
    InputMethod[InputMethod["touch"] = 2] = "touch";
})(InputMethod = exports.InputMethod || (exports.InputMethod = {}));
class Message {
}
exports.Message = Message;
class Suggestion {
}
exports.Suggestion = Suggestion;
class VoicePlatform {
    inject(translations) {
        this.translations = translations;
    }
    t(key) {
        return this.translations[this.input.language][key];
    }
}
exports.VoicePlatform = VoicePlatform;
