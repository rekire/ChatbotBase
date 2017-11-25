/** This is just a polyfill and will be removed in later release */
declare function require(path: string): any;

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
 * The abstract base class for your actual implementation.
 */
export abstract class VoiceAssistant {
    private static sprintf = require('sprintf-js');
    protected language: string;
    private trackers: TrackingProvider[];
    private platforms: VoicePlatform[];

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
    public handle(json: any, response: any): Promise<Response> {
        //console.log(JSON.stringify(json));
        let output;
        const promise = new Promise<never>((result, reject) => {
            let handled = false;
            let resp;
            this.platforms.forEach(platform => {
                //console.log(platform.platformId() + " = " + platform.isSupported(json));
                if(platform.isSupported(json)) {
                    console.log("Detected platform " + platform.platformId());
                    const input = platform.parse(json);

                    this.trackers.forEach(tracker => tracker.trackInput(input));

                    this.language = input.language.substr(0, 2);
                    output = this.reply(input);
                    console.log('> ' + input.message);
                    // TODO contact the replies to get two resulting for compatibility with other platforms
                    for(let i = 0; i < output.replies.length; i++) {
                        if(output.replies[i].platform === platform.platformId()) {
                            console.log('< ' + output.replies[i].debug())
                        }
                    }
                    console.log('  [' + output.suggestions.join('] [') + ']');
                    handled = true;

                    resp = platform.render(output);
                }
            });
            if(!handled) {
                reject(resp);
            } else {
                result(resp);
            }
        });
        promise.then((resp) => {
            output.replies.forEach((reply) => {
                if(reply.type === 'plain' && reply.platform === '*') {
                    output.message = reply.render();
                }
            });
            this.trackers.forEach(tracker => tracker.trackOutput(output));
            response.end(JSON.stringify(resp));
        });
        return promise;
    }

    /** Callback to load the supported platforms your implementation. */
    protected abstract loadPlatforms(): VoicePlatform[]

    /** Override this method to choose the tracking platforms you want. By default this is an empty list. */
    protected loadTracker(): TrackingProvider[] {
        return []
    }

    /** Callback to load the translations. */
    protected abstract loadTranslations(): Translations

    /**
     * This function generates the output message which will be used for rendering the output and the tracking providers.
     */
    public abstract reply(input: Input): Output;

    // Translations support
    private translations: Translations;

    /**
     * This translates a key to the actual translation filling their argument if any.
     * @param {string} key The key of the translation.
     * @param args The var args of the optional placeholders.
     * @returns {string} containing the actual string.
     */
    protected t(key: string, ...args): string {
        let translation = this.translations[this.language][key];
        if(translation instanceof Array) {
            translation = translation[Math.floor(Math.random() * translation.length)]
        }
        const newArg = [translation];
        args.forEach(arg => newArg.push(arg));
        return VoiceAssistant.sprintf.sprintf.apply(this, newArg);
    }

    /**
     * Defines a plain text message as response. Should be handled by all platforms.
     * @param {string} message the plain text message.
     * @returns {Message} the message object which should be added to the output.
     */
    protected plainReply(message: string): Reply {
        return <Reply>{
            platform: '*',
            type: 'plain',
            render: () => message,
            debug: () => message
        };
    }

    protected formattedReply(message: string): Reply {
        return <Reply>{
            platform: '*',
            type: 'formatted',
            render: () => message,
            debug: () => message
        };
    }

    protected suggestion(label: string) {
        return <Suggestion>{
            platform: '*',
            render: () => label,
            toString: () => label
        };
    }
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
     * Create the output message based on this input message. This will copy the message id (and adds a ".reply"
     * suffix), userId, sessionId, platform, language, intent and the context. The message will be set to an empty
     * string.
     */
    reply(): Output {
        return new Output(this.id + '.reply', this.userId, this.sessionId, this.platform, this.language, this.intent, "", this.context)
    }
}

/**
 * The output message
 */
export class Output extends IOMessage {
    replies: Reply[] = [];
    suggestions: Suggestion[] = [];
    retentionMessage: string;
    expectAnswer = false;

    constructor(id: string,
                userId: string,
                sessionId: string,
                platform: string,
                language: string,
                intent: string,
                message: string,
                context: Context) {
        super(id, userId, sessionId, language, platform, new Date(), intent, InputMethod.text, message, context);
    }

    addReply(reply: Reply) {
        this.replies.push(reply);
    }

    addSuggestion(suggestion: Suggestion) {
        this.suggestions.push(suggestion);
    }

    setRetentionMessage(message: string) {
        this.retentionMessage = message;
    }

    setExpectAnswer(answerExpected: boolean) {
        this.expectAnswer = answerExpected;
    }
}

/** The input method the user used to start the current intent. */
export enum InputMethod {
    /** The input was made by voice. */
    voice,
    /** The input was made by keyboard. */
    text,
    /** The input was made by touch e.g. via a suggestion or a button on a card. */
    touch
}

export abstract class Reply {
    platform: string;

    type: string;

    abstract render(): any

    abstract debug(): string
}

export abstract class Suggestion {
    platform: string;

    abstract render(): any;
}

export abstract class VoicePlatform {
    protected input: Input;
    private translations: Translations;

    inject(translations: Translations) {
        this.translations = translations;
    }

    protected t(key: string): string | string[] { // TODO verify usage
        return this.translations[this.input.language][key];
    }

    abstract parse(body: any): Input

    abstract render(reply: Output): any

    abstract isSupported(json: any)

    abstract platformId(): string;
}

export interface TrackingProvider {
    name: string;
    logging: boolean;

    trackInput(input: Input): Promise<any>;

    trackOutput(output: Output): Promise<any>;
}