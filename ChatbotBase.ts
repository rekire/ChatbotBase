import {sprintf} from 'sprintf-js';
import * as fs from 'fs';
import * as path from 'path';

declare function require(file: string): IntentHandler

export type ReplyBuilder<T = {}> = new (...args: any[]) => T;

/**
 * The context is basically a map with a string as key holding any possible value.
 */
export interface Context {
    [key: string]: any
}

/**
 * The key of the translations is the language of the user in the [IETF language tag](https://en.wikipedia.org/wiki/IETF_language_tag)
 * format or at least the first two letters (also known as [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639-1)) if you
 * don't care for the actual region.
 */
export interface Translations {
    [language: string]: Translation
}

/**
 * The translation itself is a map of a key and the actual translation or a array of possible translations where one
 * translation will be randomly chosen. This is useful to give the user variations in answers. You can use placeholders
 * for formatted variables. Check also the syntax of [sprintf-js](https://www.npmjs.com/package/sprintf-js).
 */
export interface Translation {
    [key: string]: string | string[]
}

/**
 * A message containing the ssml and display text.
 */
export class Message {
    constructor(displayText: string, ssml: string) {
        this.displayText = displayText;
        this.ssml = ssml;
    }

    displayText: string;
    ssml: string;
}

/**
 * Abstraction layer to provide access to translations.
 */
export interface TranslationProvider {
    /**
     * Returns the DisplayText of the given key, for the locale of the user's request.
     * @param input The parsed request, this might be helpful if you want to provide platform specific translations.
     * @param {string} key The key of the translation.
     * @param args The var args of the optional variables in the output.
     * @returns {string} containing the actual string.
     */
    getDisplayText(input: IOMessage, key: string, ...args: string[]): string | null

    /**
     * Returns the SSML-String of the given key, for the locale of the user's request.
     * @param input The parsed request, this might be helpful if you want to provide platform specific translations.
     * @param {string} key The key of the translation.
     * @param args The var args of the optional variables in the output.
     * @returns {string} containing the actual string.
     */
    getSsml(input: IOMessage, key: string, ...args: string[]): string | null

    /**
     * Returns Message of the given key, for the locale of the user's request.
     * @param input The parsed request, this might be helpful if you want to provide platform specific translations.
     * @param {string} key The key of the translation.
     * @param args The var args of the optional variables in the output.
     * @returns {string} containing the actual string.
     */
    getMessage(input: IOMessage, key: string, ...args: string[]): Message | null
}

/**
 * Simple translation holder, based on the Translations data structure.
 */
export class MapTranslator implements TranslationProvider {
    private readonly translations: Translations;

    /**
     * Creates a new instance of the MapTranslator.
     * @param translations The actual data you want to provide.
     */
    constructor(translations: Translations) {
        this.translations = translations;
    }

    getDisplayText(input: IOMessage, key: string, ...args: string[]): string | null {
        let translation = this.translations[input.language][key];
        if(translation instanceof Array) {
            translation = translation[Math.floor(Math.random() * translation.length)]
        }
        const newArg = [translation];
        args.forEach(arg => newArg.push(arg));
        return sprintf.apply(this, newArg);
    }

    getSsml(input: IOMessage, key: string, ...args): string | null {
        return "<speak>" + this.getDisplayText(input, key, ...args) + "</speak>"
    }

    getMessage(input: IOMessage, key: string, ...args): Message | null {
        const text = this.getDisplayText(input, key, ...args);
        if(text) {
            return new Message(text, "<speak>" + text + "</speak>");
        } else {
            return null;
        }
    }
}

/**
 * The abstract base class for your actual implementation.
 */
export abstract class VoiceAssistant {
    protected language: string;
    private trackers: TrackingProvider[];
    private platforms: VoicePlatform[];
    private selectedPlatform: VoicePlatform | null = null;
    private intentHandlers: IntentHandler[];

    /**
     * The constructor loads the translations, platforms and the optional tracker.
     */
    protected constructor() {
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
    public handle(request: any, response: any): Promise<Reply> {
        const rawRequest = request.rawBody;
        const json = request.body;
        const promise = new Promise<any>((result, reject) => {
            this.platforms.filter((platform) => platform.isSupported(json)).forEach(platform => {
                this.selectedPlatform = platform;

                console.log("Detected platform " + platform.platformId());
                const input = platform.parse(json);

                const verification = platform.verify(<VerifyDataHolder>{
                    rawRequest: () => rawRequest,
                    header: (name) => request.header(name)
                }, response);

                if(verification === false) {
                    return;
                }

                this.trackers.forEach(tracker => tracker.trackInput(input));

                this.language = input.language.substr(0, 2);

                let reply = this.createReply(input);

                Promise.all([verification, reply]).then((values) => {
                    const verificationStatus = values[0];
                    if(verificationStatus) {
                        const output = values[1];
                        this.logReply(platform, input, output);
                        result(output);
                    } else {
                        reject('Verification failed');
                    }
                }).catch((error) => {
                    reject(error);
                });
            });
            if(this.selectedPlatform === null) {
                reject('Request not supported');
            }
        });
        promise.then((output) => {
            output.replies.forEach((reply) => {
                if(reply.type === 'text' && reply.platform === '*') {
                    output.message = reply.render();
                }
            });
            this.trackers.forEach(tracker => tracker.trackOutput(output));
            if(this.selectedPlatform !== null) {
                response.end(JSON.stringify(this.selectedPlatform.render(output)));
            }
        }).catch((error) => {
            console.log("CBB-Error: ", error);
            response.end(JSON.stringify({error: error.toString()}));
        });
        return promise;
    }

    private createReply(input: Input): Output | Promise<Output> {
        if(this.intentHandlers.length) {
            const handler = this.intentHandlers.find(handler => handler.isSupported(input));
            if(handler) {
                return handler.createOutput(input, this.translations);
            }
        }
        return this.createFallbackReply(input);
    }

    private logReply(platform: VoicePlatform, input: Input, output: Output) {
        console.log('> ' + input.message);
        // TODO contact the replies to get two resulting for compatibility with other platforms
        for(let i = 0; i < output.replies.length; i++) {
            if(output.replies[i].platform === platform.platformId()) {
                console.log('< ' + output.replies[i].debug().replace('\n', '\n< '))
            }
        }
        console.log('  [' + output.suggestions.join('] [') + ']');
    }

    /** Callback to load the supported platforms your implementation. */
    protected abstract loadPlatforms(): VoicePlatform[]

    /** Override this method to choose the tracking platforms you want. By default this is an empty list. */
    protected loadTracker(): TrackingProvider[] {
        return []
    }

    /** Callback to create the TranslationProvider. */
    protected abstract provideTranslations(): TranslationProvider

    private searchIntentHandlers(): IntentHandler[] {
        const intents: IntentHandler[] = [];
        if(fs.existsSync("intents")) {
            fs.readdirSync("intents").forEach(file => {
                if(file.endsWith(".js")) {
                    const name = file.substring(0, file.length - 3);
                    intents.push(new (require(path.resolve(`./intents/${name}`))[name]));
                }
            });
        }
        return intents;
    }

    /**
     * This function generates the output message which will be used for rendering the output and the tracking providers.
     */
    public abstract createFallbackReply(input: Input): Output | Promise<Output>;

    // Translations support
    protected readonly translations: TranslationProvider;
}

/**
 * The abstract base class for input and output messages.
 */
export abstract class IOMessage {
    /** The identifier of the message which comes from the platform to identify messages thrue the system. */
    id: string;
    /** The user identifier the same user in a conversation. */
    userId: string;
    /** A session id which is used to identify if an intent was fired in the same or a different season. */
    sessionId: string;
    /** The language of the user in the [IETF language tag](https://en.wikipedia.org/wiki/IETF_language_tag) or at least the first two letters (also known as [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639-1)). */
    platform: string;
    /** A readable representation of the platform where the message was entered. Like Google Home, Google Assistant, Amazon Alexa or Amazon FireTV. */
    language: string;
    /** The time when the message was entered if the input has not this field use the current time. This field can be used in analytics to track the response time. */
    time: Date;
    /** If you don't analyse the raw messages of the user a platform like Dialogflow or Alexa will give you some intent to identify the intent of the user. */
    intent: string;
    /** The input method of the user like `Voice`, `Text` or `Touch`, if you don't know it use the most likely one. */
    inputMethod: InputMethod;
    /** The raw message of the user when given. */
    message: string;
    /** A map of the context for this conversation. */
    context: Context;
    /** Internal data for the platforms. Each key has to be prefixed to avoid collisions. */
    internalData = new Map<string, any>();

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
    constructor(id: string,
                userId: string,
                sessionId: string,
                language: string,
                platform: string,
                time: Date,
                intent: string,
                inputMethod: InputMethod,
                message: string,
                context: Context) {
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

/**
 * The normalized message you got from the platform which could parse the request.
 */
export class Input extends IOMessage {
    /**
     * The optional access token of the request. Only set when a account binding is used.
     */
    accessToken: string;

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
    constructor(id: string,
                userId: string,
                sessionId: string,
                language: string,
                platform: string,
                time: Date,
                intent: string,
                inputMethod: InputMethod,
                message: string,
                context: Context,
                accessToken: string) {
        super(id, userId, sessionId, language, platform, time, intent, inputMethod, message, context);
        this.accessToken = accessToken;
    }
}

/**
 * The output message
 */
export abstract class Output extends IOMessage {
    replies: Reply[] = [];
    suggestions: Suggestion[] = [];
    retentionMessage: string;
    expectAnswer = false;

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
    protected constructor(id: string,
                userId: string,
                sessionId: string,
                platform: string,
                language: string,
                intent: string,
                message: string,
                context: Context) {
        super(id, userId, sessionId, language, platform, new Date(), intent, InputMethod.text, message, context);
    }

    /**
     * Add a reply to the output. Should be at least VoiceAssistant.textReply().
     * @param {Reply | String} reply The reply you want to add, or the translation key.
     * @param args The arguments with the optional arguments.
     */
    abstract addReply(reply: Reply | string | Message, ...args: string[])

    /**
     * Add a suggestion to the output.
     * @param {Suggestion} suggestion The suggestion to add.
     */
    addSuggestion(suggestion: Suggestion) {
        this.suggestions.push(suggestion);
    }

    /**
     * Add a retention message which will be send when setExpectAnswer() was set to true.
     * @param {string} message The message which should be said after a platform specific timeout.
     */
    setRetentionMessage(message: string) {
        this.retentionMessage = message;
    }

    /**
     * Set to `true` to indidate that you expect an answer and that this conversation should not end now.
     * @param {boolean} answerExpected
     */
    setExpectAnswer(answerExpected: boolean) {
        this.expectAnswer = answerExpected;
    }
}

export class DefaultReply extends Output {
    private readonly translations: TranslationProvider;

    constructor(input: Input, translations: TranslationProvider) {
        super(input.id,
            input.userId,
            input.sessionId,
            input.platform,
            input.language,
            input.intent,
            input.message,
            input.context);
        this.translations = translations;
    }

    addReply(reply: Reply | string | Message, ...args) {
        if(reply instanceof Reply) {
            this.replies.push(reply);
        } else if(reply instanceof Message) {
            this.addTextReply(reply.displayText);
            this.addVoiceReply(reply.ssml);
        } else {
            const allArgs = [<string>reply];
            args.forEach(arg => allArgs.push(arg));
            this.addReply(this.addMessage.apply(this, allArgs))
        }
    }

    /**
     * Add a suggestion to the output.
     * @param {Suggestion} suggestion The suggestion to add.
     * @param args The var args of the optional variables in the output.
     */
    addSuggestion(suggestion: Suggestion | string, ...args) {
        if(suggestion instanceof Suggestion) {
            super.addSuggestion(suggestion);
        } else {
            const msg = this.createMessage(suggestion, ...args);
            this.suggestions.push(<Suggestion>{
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
    addTextReply(message: string, ...args) {
        const msg = this.t(message, ...args);
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
    addVoiceReply(message: string, ...args) {
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
    suggestion(label: string) {
        return <Suggestion>{
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
    t(key: string, ...args): string {
        let text = this.translations.getDisplayText(this, key, ...args);
        if(text) {
            return <string>text;
        } else {
            throw Error(`No translation for key "${key}" found.`)
        }
    }

    addMessage(key: string, ...args) {
        this.addReply(this.createMessage(key, ...args));
    }

    private createMessage(key: string, ...args): Message {
        let containsMessage = false;
        const textArgs : string[] = [];
        const ssmlArgs : string[] = [];
        args.forEach((val) => {
            if(val instanceof Message) {
                containsMessage = true;
                textArgs.push(val.displayText);
                ssmlArgs.push(val.ssml.replace(/(^<speak>|<\/speak>$)/g, ""));
            } else {
                textArgs.push(val.toString());
                ssmlArgs.push(val);
            }
        });
        if(containsMessage) {
            const ssml = this.translations.getSsml(this, key, ...ssmlArgs) || sprintf(key, ssmlArgs);
            const text = this.translations.getDisplayText(this, key, ...textArgs) || sprintf(key, textArgs);
            return new Message(text, `<speak>${ssml}</speak>`)
        } else {
            return this.translations.getMessage(this, key, ...args) || DefaultReply.applyTextAsMessage(key, args);
        }
    }

    private static applyTextAsMessage(key: string, args: string[]) {
        const text = sprintf(key, ...args);
        return new Message(text, `<speak>${text}</speak>`);
    }
}

/**
 * The input method the user used to start the current intent.
 */
export enum InputMethod {
    /** The input was made by voice. */
    voice,
    /** The input was made by keyboard. */
    text,
    /** The input was made by touch e.g. via a suggestion or a button on a card. */
    touch
}

/**
 * The base class for any replies.
 */
export abstract class Reply {
    /**
     * The platform id of the platform which created and support this kind of reply. Can be also `*` for some generic
     * replies defined by the ChatbotBase like plain text replies.
     */
    platform: string;

    /**
     * The type of the reply, so you can distinct what kind of reply this is.
     */
    type: string;

    /**
     * Renders the reply for the target platform.
     * @returns {any} The object which will be rendered by the platform.
     */
    abstract render(): any

    /**
     * @returns {string} The plain text representation for debugging.
     */
    abstract debug(): string
}

/**
 * A suggestion which should be shown the user.
 */
export abstract class Suggestion {
    /**
     * The platform id of the platform which created and support this kind of suggestion.
     */
    platform: string;

    /**
     * Renders the suggestion for the target platform.
     * @returns {any} The object which will be rendered by the platform.
     */
    abstract render(): any;
}

/**
 * This is the base class add support for a new platform.
 */
export abstract class VoicePlatform {
    /**
     * @returns {string} A unique name to identify your platform. This is used to identify special formatted custom messages.
     */
    abstract platformId(): string;

    /**
     * Will be invoked with the request body to check if this platform supports this kind of input.
     * @param json The request body which should be checked.
     * @returns `true` if the request is supported by this platform.
     */
    abstract isSupported(json: any): boolean;

    /**
     * Parse the request and returns the parsed input.
     * @param body The request body of the incoming request.
     * @returns {Input} The parsed input object.
     */
    abstract parse(body: any): Input

    /**
     * Render the output for this platform.
     * @param {Output} output The output to render.
     * @returns {any} The platform specific response.
     */
    abstract render(output: Output): any;

    /**
     * The verify callback, here you can validate the request and optional write a response out in the error case
     * directly. When the implementation returns a promise the response will just be written out in the good case, when
     * using a boolean return value the handler won't be called. In good case the response will be written out as usual.
     * @param {VerifyDataHolder} request
     * @param response
     * @returns {Promise<boolean> | boolean}
     */
    verify(request: VerifyDataHolder, response: any): Promise<boolean> | boolean {
        return true; // the default implementation accepts all requests.
    }
}

/**
 * Tracking interface of the ChatbotBase.
 */
export interface TrackingProvider {
    /** The name of the tracking interface */
    name: string;

    /**
     * Track an input message.
     * @param {Input} input The input message to be tracked.
     * @returns {Promise<any>} A promise to make sure that this call can be made async.
     */
    trackInput(input: Input): Promise<any>;

    /**
     * Track an output message.
     * @param {Output} output The output message to be tracked.
     * @returns {Promise<any>} A promise to make sure that this call can be made async.
     */
    trackOutput(output: Output): Promise<any>;
}

/**
 * Interface for accessing the raw request and the request data.
 */
export interface VerifyDataHolder {
    /**
     * @returns {string} the raw request data.
     */
    rawRequest(): string;

    /**
     * Provides a given http request header value.
     * @param {string} name the header you are interested in.
     * @returns {string} the value of the header.
     */
    header(name: string): string;
}

/**
 * Predefined permissions which should be relevant for the most platforms. Check also the documentation of the actual
 * implementation how to get the requested data.
 */
export enum VoicePermission {
    /** The exact position of the user e.g. the GPS position. */
    ExactPosition,
    /** The in the profile saved position of the user mostly the zip code and the country. */
    RegionalPosition,
    /** The name of the user. */
    UserName,
    /** Read the to do list. */
    ReadToDos,
    /** Write the to do list. */
    WriteToDos,
}

export interface IntentHandler {
    isSupported(input: Input): boolean

    createOutput(input: Input, translations: TranslationProvider): Output | Promise<Output>
}