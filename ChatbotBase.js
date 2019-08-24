"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sprintf_js_1 = require("sprintf-js");
const fs = require("fs");
const path = require("path");
/**
 * A message containing the ssml and display text.
 */
class Message {
    constructor(displayText, ssml) {
        this.displayText = displayText;
        this.ssml = ssml;
    }
}
exports.Message = Message;
/**
 * Simple translation holder, based on the Translations data structure.
 */
class MapTranslator {
    /**
     * Creates a new instance of the MapTranslator.
     * @param translations The actual data you want to provide.
     */
    constructor(translations) {
        this.translations = translations;
    }
    getDisplayText(input, key, ...args) {
        let translation = this.translations[input.language][key];
        if (translation instanceof Array) {
            translation = translation[Math.floor(Math.random() * translation.length)];
        }
        const newArg = [translation];
        args.forEach(arg => newArg.push(arg));
        return sprintf_js_1.sprintf.apply(this, newArg);
    }
    getSsml(input, key, ...args) {
        return this.getDisplayText(input, key, ...args);
    }
    getMessage(input, key, ...args) {
        const text = this.getDisplayText(input, key, ...args);
        if (text) {
            return new Message(text, text);
        }
        else {
            return null;
        }
    }
    hasKey(input, key) {
        return !!this.translations[input.language][key];
    }
}
exports.MapTranslator = MapTranslator;
/**
 * The abstract base class for your actual implementation.
 */
class VoiceAssistant {
    /**
     * The constructor loads the translations, platforms and the optional tracker.
     */
    constructor() {
        this.selectedPlatform = null;
        this.translations = this.provideTranslations();
        this.platforms = this.loadPlatforms();
        this.trackers = this.loadTracker();
        this.intentHandlers = this.searchIntentHandlers();
    }
    /**
     * The handler of the platform, this will render all replies, suggestions and send the platform specific response
     * out. This will also invoke the trackers async using a promise.
     * @param request the incoming request.
     * @param response Is a object where the `end()` function will be called to send the response to the calling client.
     * To be honest this does not really make sense and will be changed later to a simple callback.
     * @returns {Promise<Reply>} A promise which you should return to allow closing the connection and let the
     * process life until the tracking code ends.
     */
    handle(request, response) {
        const rawRequest = request.rawBody;
        const json = request.body;
        const promise = new Promise((result, reject) => {
            this.platforms.filter((platform) => platform.isSupported(json)).forEach(platform => {
                this.selectedPlatform = platform;
                console.log("Detected platform " + platform.platformId());
                const input = platform.parse(json);
                const verification = platform.verify({
                    rawRequest: () => rawRequest,
                    header: (name) => request.header(name)
                }, response);
                if (verification === false) {
                    return;
                }
                this.trackers.forEach(tracker => tracker.trackInput(input));
                this.language = input.language.substr(0, 2);
                let reply = this.createReply(input);
                Promise.all([verification, reply]).then((values) => {
                    const verificationStatus = values[0];
                    if (verificationStatus) {
                        const output = values[1];
                        this.logReply(platform, input, output);
                        result(output);
                    }
                    else {
                        reject('Verification failed');
                    }
                }).catch((error) => {
                    reject(error);
                });
            });
            if (this.selectedPlatform === null) {
                reject('Request not supported');
            }
        });
        promise.then((output) => {
            output.replies.forEach((reply) => {
                if (reply.type === 'text' && reply.platform === '*') {
                    output.message = reply.render();
                }
            });
            this.trackers.forEach(tracker => tracker.trackOutput(output));
            if (this.selectedPlatform !== null) {
                response.end(JSON.stringify(this.selectedPlatform.render(output)));
            }
        }).catch((error) => {
            console.log("CBB-Error: ", error);
            response.end(JSON.stringify({ error: error.toString() }));
        });
        return promise;
    }
    createReply(input) {
        if (this.intentHandlers.length) {
            const handler = this.intentHandlers.find(handler => handler.isSupported(input));
            if (handler) {
                return handler.createOutput(input, this.translations);
            }
        }
        return this.createFallbackReply(input);
    }
    logReply(platform, input, output) {
        console.log('> ' + input.message);
        // TODO contact the replies to get two resulting for compatibility with other platforms
        for (let i = 0; i < output.replies.length; i++) {
            if (output.replies[i].platform === platform.platformId()) {
                console.log('< ' + output.replies[i].debug().replace('\n', '\n< '));
            }
        }
        console.log('  [' + output.suggestions.join('] [') + ']');
    }
    /** Override this method to choose the tracking platforms you want. By default this is an empty list. */
    loadTracker() {
        return [];
    }
    searchIntentHandlers() {
        const intents = [];
        if (fs.existsSync("intents")) {
            fs.readdirSync("intents").forEach(file => {
                if (file.endsWith(".js")) {
                    const name = file.substring(0, file.length - 3);
                    intents.push(new (require(path.resolve(`./intents/${name}`))[name]));
                }
            });
        }
        return intents;
    }
}
exports.VoiceAssistant = VoiceAssistant;
/**
 * The abstract base class for input and output messages.
 */
class IOMessage {
    /**
     * The constructor of the message object.
     * @param {string} id The identifier of the message which comes from the platform to identify messages thrue the system.
     * @param {string} userId The user identifier the same user in a conversation.
     * @param {string} sessionId A session id which is used to identify if an intent was fired in the same or a different season.
     * @param {string} language The language of the user in the [IETF language tag](https://en.wikipedia.org/wiki/IETF_language_tag) or at least the first two letters (also known as [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639-1)).
     * @param {string} platform A readable representation of the platform where the message was entered. Like Google Home, Google Assistant, Amazon Alexa or Amazon FireTV.
     * @param {Date} time The time when the message was entered if the input has not this field use the current time. This field can be used in analytics to track the response time.
     * @param {string} intent If you don't analyse the raw messages of the user a platform like Dialogflow or Alexa will give you some intent to identify the intent of the user.
     * @param {InputMethod} inputMethod The input method of the user like `Voice`, `Text` or `Touch`, if you don't know it use the most likely one.
     * @param {string} message The raw message of the user when given.
     * @param {Context} context A map of the context for this conversation.
     */
    constructor(id, userId, sessionId, language, platform, time, intent, inputMethod, message, context) {
        /** Internal data for the platforms. Each key has to be prefixed to avoid collisions. */
        this.internalData = new Map();
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
/**
 * The normalized message you got from the platform which could parse the request.
 */
class Input extends IOMessage {
    /**
     * The constructor of the message object.
     * @param {string} id The identifier of the message which comes from the platform to identify messages thrue the system.
     * @param {string} userId The user identifier the same user in a conversation.
     * @param {string} sessionId A session id which is used to identify if an intent was fired in the same or a different season.
     * @param {string} language The language of the user in the [IETF language tag](https://en.wikipedia.org/wiki/IETF_language_tag) or at least the first two letters (also known as [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639-1)).
     * @param {string} platform A readable representation of the platform where the message was entered. Like Google Home, Google Assistant, Amazon Alexa or Amazon FireTV.
     * @param {Date} time The time when the message was entered if the input has not this field use the current time. This field can be used in analytics to track the response time.
     * @param {string} intent If you don't analyse the raw messages of the user a platform like Dialogflow or Alexa will give you some intent to identify the intent of the user.
     * @param {InputMethod} inputMethod The input method of the user like `Voice`, `Text` or `Touch`, if you don't know it use the most likely one.
     * @param {string} message The raw message of the user when given.
     * @param {Context} context A map of the context for this conversation.
     * @param {string} accessToken The optional access token of the request.
     */
    constructor(id, userId, sessionId, language, platform, time, intent, inputMethod, message, context, accessToken) {
        super(id, userId, sessionId, language, platform, time, intent, inputMethod, message, context);
        this.accessToken = accessToken;
    }
}
exports.Input = Input;
/**
 * The output message
 */
class Output extends IOMessage {
    /**
     * The constructor of the output message object. This will use the current time an date and the input method text.
     * @param {string} id The identifier of the message which comes from the platform to identify messages thrue the system.
     * @param {string} userId The user identifier the same user in a conversation.
     * @param {string} sessionId A session id which is used to identify if an intent was fired in the same or a different season.
     * @param {string} language The language of the user in the [IETF language tag](https://en.wikipedia.org/wiki/IETF_language_tag) or at least the first two letters (also known as [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639-1)).
     * @param {string} platform A readable representation of the platform where the message was entered. Like Google Home, Google Assistant, Amazon Alexa or Amazon FireTV.
     * @param {string} intent If you don't analyse the raw messages of the user a platform like Dialogflow or Alexa will give you some intent to identify the intent of the user.
     * @param {string} message The raw message of the user when given.
     * @param {Context} context A map of the context for this conversation.
     */
    constructor(id, userId, sessionId, platform, language, intent, message, context) {
        super(id, userId, sessionId, language, platform, new Date(), intent, InputMethod.text, message, context);
        this.replies = [];
        this.suggestions = [];
        this.expectAnswer = false;
    }
    /**
     * Add a suggestion to the output.
     * @param {Suggestion} suggestion The suggestion to add.
     */
    addSuggestion(suggestion) {
        this.suggestions.push(suggestion);
    }
    /**
     * Add a retention message which will be send when setExpectAnswer() was set to true.
     * @param {string} message The message which should be said after a platform specific timeout.
     */
    setRetentionMessage(message) {
        this.retentionMessage = message;
    }
    /**
     * Set to `true` to indidate that you expect an answer and that this conversation should not end now.
     * @param {boolean} answerExpected
     */
    setExpectAnswer(answerExpected) {
        this.expectAnswer = answerExpected;
    }
}
exports.Output = Output;
class DefaultReply extends Output {
    constructor(input, translations) {
        super(input.id, input.userId, input.sessionId, input.platform, input.language, input.intent, input.message, input.context);
        this.translations = translations;
        this.internalData = input.internalData;
    }
    addReply(reply, ...args) {
        if (!reply)
            return;
        if (reply.hasOwnProperty('platform') && reply.hasOwnProperty('type')) {
            this.replies.push(reply);
        }
        else if (reply instanceof Message) {
            this.addTextReply(reply.displayText);
            this.addVoiceReply(reply.ssml);
        }
        else {
            const allArgs = [reply];
            args.forEach(arg => allArgs.push(arg));
            this.addReply(this.addMessage.apply(this, allArgs));
        }
    }
    /**
     * Add a suggestion to the output.
     * @param {Suggestion} suggestion The suggestion to add.
     * @param args The var args of the optional variables in the output.
     */
    addSuggestion(suggestion, ...args) {
        if (suggestion instanceof Suggestion) {
            super.addSuggestion(suggestion);
        }
        else {
            const msg = this.createMessage(suggestion, ...args);
            this.suggestions.push({
                platform: '*',
                render: () => msg.displayText,
                toString: () => msg.displayText
            });
        }
    }
    /**
     * Defines a text message as response. Should be handled by all platforms.
     * @param {string} message the plain text message.
     * @param args The var args of the optional variables in the output.
     * @returns {Reply} the message object which should be added to the output.
     */
    addTextReply(message, ...args) {
        const msg = this.createMessage(message, ...args);
        return {
            platform: '*',
            type: 'text',
            render: () => msg,
            debug: () => msg || "<null>"
        };
    }
    /**
     * Defines a SSML formatted message as response. Should be handled by all platforms.
     * @param {string} message the formatted text message.
     * @param args The var args of the optional variables in the output.
     * @returns {Reply} the message object which should be added to the output.
     */
    addVoiceReply(message, ...args) {
        const msg = this.createMessage(message, ...args);
        this.addReply({
            platform: '*',
            type: 'ssml',
            render: () => msg.ssml,
            debug: () => msg.ssml
        });
    }
    /**
     * Creat a plain text suggestion for supported platforms.
     * @param {string} label The label to click on.
     * @returns {Suggestion}
     */
    suggestion(label) {
        return {
            platform: '*',
            render: () => label,
            toString: () => label
        };
    }
    /**
     * Create a localized output with all the injected variables.
     * @param key The key of the translation.
     * @param args The var args of the optional variables in the output.
     * Please note if the translation is missing or resulting an empty string an Error will be thrown.
     */
    t(key, ...args) {
        let text = this.translations.getDisplayText(this, key, ...args);
        if (text) {
            return text;
        }
        else {
            throw Error(`No translation for key "${key}" found.`);
        }
    }
    addMessage(key, ...args) {
        this.addReply(this.createMessage(key, ...args));
    }
    createMessage(key, ...args) {
        if (!this.translations.hasKey(this, key)) {
            return new Message(key, key);
        }
        let containsMessage = false;
        const textArgs = [];
        const ssmlArgs = [];
        args.forEach((val) => {
            if (val instanceof Message) {
                containsMessage = true;
                textArgs.push(val.displayText);
                ssmlArgs.push(val.ssml);
            }
            else {
                textArgs.push(val.toString());
                ssmlArgs.push(val);
            }
        });
        if (containsMessage) {
            const ssml = this.translations.getSsml(this, key, ...ssmlArgs) || sprintf_js_1.sprintf(key, ssmlArgs);
            const text = this.translations.getDisplayText(this, key, ...textArgs) || sprintf_js_1.sprintf(key, textArgs);
            return new Message(text, ssml);
        }
        else {
            return this.translations.getMessage(this, key, ...args) || DefaultReply.applyTextAsMessage(key, args);
        }
    }
    static applyTextAsMessage(key, args) {
        const text = sprintf_js_1.sprintf(key, ...args);
        return new Message(text, text);
    }
}
exports.DefaultReply = DefaultReply;
/**
 * The input method the user used to start the current intent.
 */
var InputMethod;
(function (InputMethod) {
    /** The input was made by voice. */
    InputMethod[InputMethod["voice"] = 0] = "voice";
    /** The input was made by keyboard. */
    InputMethod[InputMethod["text"] = 1] = "text";
    /** The input was made by touch e.g. via a suggestion or a button on a card. */
    InputMethod[InputMethod["touch"] = 2] = "touch";
})(InputMethod = exports.InputMethod || (exports.InputMethod = {}));
/**
 * The base class for any replies.
 */
class Reply {
}
exports.Reply = Reply;
/**
 * A suggestion which should be shown the user.
 */
class Suggestion {
}
exports.Suggestion = Suggestion;
/**
 * This is the base class add support for a new platform.
 */
class VoicePlatform {
    /**
     * The verify callback, here you can validate the request and optional write a response out in the error case
     * directly. When the implementation returns a promise the response will just be written out in the good case, when
     * using a boolean return value the handler won't be called. In good case the response will be written out as usual.
     * @param {VerifyDataHolder} request
     * @param response
     * @returns {Promise<boolean> | boolean}
     */
    verify(request, response) {
        return true; // the default implementation accepts all requests.
    }
}
exports.VoicePlatform = VoicePlatform;
/**
 * Predefined permissions which should be relevant for the most platforms. Check also the documentation of the actual
 * implementation how to get the requested data.
 */
var VoicePermission;
(function (VoicePermission) {
    /** The exact position of the user e.g. the GPS position. */
    VoicePermission[VoicePermission["ExactPosition"] = 0] = "ExactPosition";
    /** The in the profile saved position of the user mostly the zip code and the country. */
    VoicePermission[VoicePermission["RegionalPosition"] = 1] = "RegionalPosition";
    /** The name of the user. */
    VoicePermission[VoicePermission["UserName"] = 2] = "UserName";
    /** Read the to do list. */
    VoicePermission[VoicePermission["ReadToDos"] = 3] = "ReadToDos";
    /** Write the to do list. */
    VoicePermission[VoicePermission["WriteToDos"] = 4] = "WriteToDos";
})(VoicePermission = exports.VoicePermission || (exports.VoicePermission = {}));
//# sourceMappingURL=ChatbotBase.js.map