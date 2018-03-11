"use strict";
///<reference path="node_modules/@types/node/index.d.ts"/>
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
/**
 * The abstract base class for your actual implementation.
 */
var VoiceAssistant = (function () {
    /**
     * The constructor loads the translations, platforms and the optional tracker.
     */
    function VoiceAssistant() {
        this.translations = this.loadTranslations();
        this.platforms = this.loadPlatforms();
        this.trackers = this.loadTracker();
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
    VoiceAssistant.prototype.handle = function (request, response) {
        var _this = this;
        var rawRequest = request.rawBody;
        var json = request.body;
        var selectedPlatform = null;
        var promise = new Promise(function (result, reject) {
            _this.platforms.forEach(function (platform) {
                //console.log(platform.platformId() + " = " + platform.isSupported(json));
                if (platform.isSupported(json)) {
                    selectedPlatform = platform;
                    console.log("Detected platform " + platform.platformId());
                    var input_1 = platform.parse(json);
                    var verification = platform.verify({
                        rawRequest: function () { return rawRequest; },
                        header: function (name) { return request.header(name); }
                    }, response);
                    if (verification === false) {
                        return;
                    }
                    _this.trackers.forEach(function (tracker) { return tracker.trackInput(input_1); });
                    _this.language = input_1.language.substr(0, 2);
                    var reply = _this.reply(input_1);
                    Promise.all([verification, reply]).then(function (values) {
                        var verificationStatus = values[0];
                        if (verificationStatus) {
                            var output = values[1];
                            _this.logReply(platform, input_1, output);
                            result(output);
                        }
                        else {
                            reject('Verification failed');
                        }
                    })["catch"](function (error) {
                        reject(error);
                    });
                }
            });
            if (selectedPlatform === null) {
                reject('Request not supported');
            }
        });
        promise.then(function (output) {
            output.replies.forEach(function (reply) {
                if (reply.type === 'plain' && reply.platform === '*') {
                    output.message = reply.render();
                }
            });
            _this.trackers.forEach(function (tracker) { return tracker.trackOutput(output); });
            if (selectedPlatform !== null) {
                response.end(JSON.stringify(selectedPlatform.render(output)));
            }
        })["catch"](function (error) {
            console.log("CBB-Error: ", error);
        });
        return promise;
    };
    VoiceAssistant.prototype.logReply = function (platform, input, output) {
        console.log('> ' + input.message);
        // TODO contact the replies to get two resulting for compatibility with other platforms
        for (var i = 0; i < output.replies.length; i++) {
            if (output.replies[i].platform === platform.platformId()) {
                console.log('< ' + output.replies[i].debug().replace('\n', '\n< '));
            }
        }
        console.log('  [' + output.suggestions.join('] [') + ']');
    };
    /** Override this method to choose the tracking platforms you want. By default this is an empty list. */
    VoiceAssistant.prototype.loadTracker = function () {
        return [];
    };
    /**
     * This translates a key to the actual translation filling their argument if any.
     * @param {string} key The key of the translation.
     * @param args The var args of the optional placeholders.
     * @returns {string} containing the actual string.
     */
    VoiceAssistant.prototype.t = function (key) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var translation = this.translations[this.language][key];
        if (translation instanceof Array) {
            translation = translation[Math.floor(Math.random() * translation.length)];
        }
        var newArg = [translation];
        args.forEach(function (arg) { return newArg.push(arg); });
        return VoiceAssistant.sprintf.sprintf.apply(this, newArg);
    };
    /**
     * Defines a plain text message as response. Should be handled by all platforms.
     * @param {string} message the plain text message.
     * @returns {Reply} the message object which should be added to the output.
     */
    VoiceAssistant.prototype.plainReply = function (message) {
        return {
            platform: '*',
            type: 'plain',
            render: function () { return message; },
            debug: function () { return message; }
        };
    };
    /**
     * Defines a formatted text message as response. Should be handled by all platforms.
     * @param {string} message the formatted text message.
     * @returns {Reply} the message object which should be added to the output.
     */
    VoiceAssistant.prototype.formattedReply = function (message) {
        return {
            platform: '*',
            type: 'formatted',
            render: function () { return message; },
            debug: function () { return message; }
        };
    };
    /**
     * Creat a plain text suggestion for supported platforms.
     * @param {string} label The label to click on.
     * @returns {Suggestion}
     */
    VoiceAssistant.prototype.suggestion = function (label) {
        return {
            platform: '*',
            render: function () { return label; },
            toString: function () { return label; }
        };
    };
    VoiceAssistant.sprintf = require('sprintf-js');
    return VoiceAssistant;
}());
exports.VoiceAssistant = VoiceAssistant;
/**
 * The abstract base class for input and output messages.
 */
var IOMessage = (function () {
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
    function IOMessage(id, userId, sessionId, language, platform, time, intent, inputMethod, message, context) {
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
    return IOMessage;
}());
exports.IOMessage = IOMessage;
/**
 * The normalized message you got from the platform which could parse the request.
 */
var Input = (function (_super) {
    __extends(Input, _super);
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
    function Input(id, userId, sessionId, language, platform, time, intent, inputMethod, message, context, accessToken) {
        var _this = _super.call(this, id, userId, sessionId, language, platform, time, intent, inputMethod, message, context) || this;
        _this.accessToken = accessToken;
        return _this;
    }
    /**
     * Create the output message based on this input message. This will copy the message id (and adds a ".reply"
     * suffix), userId, sessionId, platform, language, intent and the context. The message will be set to an empty
     * string.
     */
    Input.prototype.reply = function () {
        return new Output(this.id + '.reply', this.userId, this.sessionId, this.platform, this.language, this.intent, "", this.context);
    };
    return Input;
}(IOMessage));
exports.Input = Input;
/**
 * The output message
 */
var Output = (function (_super) {
    __extends(Output, _super);
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
    function Output(id, userId, sessionId, platform, language, intent, message, context) {
        var _this = _super.call(this, id, userId, sessionId, language, platform, new Date(), intent, InputMethod.text, message, context) || this;
        _this.replies = [];
        _this.suggestions = [];
        _this.expectAnswer = false;
        return _this;
    }
    /**
     * Add a reply to the output. Should be at least VoiceAssistant.plainReply().
     * @param {Reply} reply The reply you want to add.
     */
    Output.prototype.addReply = function (reply) {
        this.replies.push(reply);
    };
    /**
     * Add a suggestion to the output.
     * @param {Suggestion} suggestion The suggestion to add.
     */
    Output.prototype.addSuggestion = function (suggestion) {
        this.suggestions.push(suggestion);
    };
    /**
     * Add a retention message which will be send when setExpectAnswer() was set to true.
     * @param {string} message The message which should be said after a platform specific timeout.
     */
    Output.prototype.setRetentionMessage = function (message) {
        this.retentionMessage = message;
    };
    /**
     * Set to `true` to indidate that you expect an answer and that this conversation should not end now.
     * @param {boolean} answerExpected
     */
    Output.prototype.setExpectAnswer = function (answerExpected) {
        this.expectAnswer = answerExpected;
    };
    return Output;
}(IOMessage));
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
var Reply = (function () {
    function Reply() {
    }
    return Reply;
}());
exports.Reply = Reply;
/**
 * A suggestion which should be shown the user.
 */
var Suggestion = (function () {
    function Suggestion() {
    }
    return Suggestion;
}());
exports.Suggestion = Suggestion;
/**
 * This is the base class add support for a new platform.
 */
var VoicePlatform = (function () {
    function VoicePlatform() {
    }
    /**
     * The verify callback, here you can validate the request and optional write a response out in the error case
     * directly. When the implementation returns a promise the response will just be written out in the good case, when
     * using a boolean return value the handler won't be called. In good case the response will be written out as usual.
     * @param {VerifyDataHolder} request
     * @param response
     * @returns {Promise<boolean> | boolean}
     */
    VoicePlatform.prototype.verify = function (request, response) {
        return true; // the default implementation accepts all requests.
    };
    return VoicePlatform;
}());
exports.VoicePlatform = VoicePlatform;
