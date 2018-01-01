"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * The abstract base class for your actual implementation.
 */
class VoiceAssistant {
    /**
     * The constructor loads the translations, platforms and the optional tracker.
     */
    constructor() {
        this.translations = this.loadTranslations();
        this.platforms = this.loadPlatforms();
        this.trackers = this.loadTracker();
    }
    /**
     * The handler of the platform, this will render all replies, suggestions and send the platform specific response
     * out. This will also invoke the trackers async using a promise.
     * @param json the raw input of the webhook.
     * @param response Is a object where the `end()` function will be called to send the response to the calling client.
     * To be honest this does not really make sense and will be changed later to a simple callback.
     * @returns {Promise<Response>} A promise which you should return to allow closing the connection and let the
     * process life until the tracking code ends.
     */
    handle(json, response) {
        //console.log(JSON.stringify(json));
        let selectedPlatform = null;
        const promise = new Promise((result, reject) => {
            this.platforms.forEach(platform => {
                //console.log(platform.platformId() + " = " + platform.isSupported(json));
                if (platform.isSupported(json)) {
                    selectedPlatform = platform;
                    console.log("Detected platform " + platform.platformId());
                    const input = platform.parse(json);
                    this.trackers.forEach(tracker => tracker.trackInput(input));
                    this.language = input.language.substr(0, 2);
                    const reply = this.reply(input);
                    // check if we got a promise or a direct answer
                    if (reply.then !== undefined) {
                        reply.then((output) => {
                            this.logReply(platform, input, output);
                            result(output);
                        }).catch((error) => {
                            reject(error);
                        });
                    }
                    else {
                        this.logReply(platform, input, reply);
                        result(reply);
                    }
                }
            });
            if (selectedPlatform === null) {
                reject('Request not supported');
            }
        });
        promise.then((output) => {
            output.replies.forEach((reply) => {
                if (reply.type === 'plain' && reply.platform === '*') {
                    output.message = reply.render();
                }
            });
            this.trackers.forEach(tracker => tracker.trackOutput(output));
            if (selectedPlatform !== null) {
                response.end(JSON.stringify(selectedPlatform.render(output)));
            }
        }).catch((error) => {
            console.log("CBB-Error: ", error);
        });
        return promise;
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
    /**
     * This translates a key to the actual translation filling their argument if any.
     * @param {string} key The key of the translation.
     * @param args The var args of the optional placeholders.
     * @returns {string} containing the actual string.
     */
    t(key, ...args) {
        let translation = this.translations[this.language][key];
        if (translation instanceof Array) {
            translation = translation[Math.floor(Math.random() * translation.length)];
        }
        const newArg = [translation];
        args.forEach(arg => newArg.push(arg));
        return VoiceAssistant.sprintf.sprintf.apply(this, newArg);
    }
    /**
     * Defines a plain text message as response. Should be handled by all platforms.
     * @param {string} message the plain text message.
     * @returns {Reply} the message object which should be added to the output.
     */
    plainReply(message) {
        return {
            platform: '*',
            type: 'plain',
            render: () => message,
            debug: () => message
        };
    }
    /**
     * Defines a formatted text message as response. Should be handled by all platforms.
     * @param {string} message the formatted text message.
     * @returns {Reply} the message object which should be added to the output.
     */
    formattedReply(message) {
        return {
            platform: '*',
            type: 'formatted',
            render: () => message,
            debug: () => message
        };
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
}
VoiceAssistant.sprintf = require('sprintf-js');
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
    /**
     * Create the output message based on this input message. This will copy the message id (and adds a ".reply"
     * suffix), userId, sessionId, platform, language, intent and the context. The message will be set to an empty
     * string.
     */
    reply() {
        return new Output(this.id + '.reply', this.userId, this.sessionId, this.platform, this.language, this.intent, "", this.context);
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
     * Add a reply to the output. Should be at least VoiceAssistant.plainReply().
     * @param {Reply} reply The reply you want to add.
     */
    addReply(reply) {
        this.replies.push(reply);
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
 *
 */
class Suggestion {
}
exports.Suggestion = Suggestion;
/**
 * This is the base class add support for a new platform.
 */
class VoicePlatform {
}
exports.VoicePlatform = VoicePlatform;
//# sourceMappingURL=ChatbotBase.js.map