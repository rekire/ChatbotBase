///<reference path="node_modules/@types/node/index.d.ts"/>

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
     * @param request the incoming request.
     * @param response Is a object where the `end()` function will be called to send the response to the calling client.
     * To be honest this does not really make sense and will be changed later to a simple callback.
     * @returns {Promise<Reply>} A promise which you should return to allow closing the connection and let the
     * process life until the tracking code ends.
     */
    public handle(request: any, response: any): Promise<Reply> {
        const rawRequest = request.rawBody;
        const json = request.body;
        let selectedPlatform: VoicePlatform | null = null;
        const promise = new Promise<any>((result, reject) => {
            this.platforms.forEach(platform => {
                //console.log(platform.platformId() + " = " + platform.isSupported(json));
                if(platform.isSupported(json)) {
                    selectedPlatform = platform;

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

                    const reply = this.reply(input);

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
                }
            });
            if(selectedPlatform === null) {
                reject('Request not supported');
            }
        });
        promise.then((output) => {
            output.replies.forEach((reply) => {
                if(reply.type === 'plain' && reply.platform === '*') {
                    output.message = reply.render();
                }
            });
            this.trackers.forEach(tracker => tracker.trackOutput(output));
            if(selectedPlatform !== null) {
                response.end(JSON.stringify(selectedPlatform.render(output)));
            }
        }).catch((error) => {
            console.log("CBB-Error: ", error)
        });
        return promise;
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

    /** Callback to load the translations. */
    protected abstract loadTranslations(): Translations

    /**
     * This function generates the output message which will be used for rendering the output and the tracking providers.
     */
    public abstract reply(input: Input): Output | Promise<Output>;

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
     * @returns {Reply} the message object which should be added to the output.
     */
    protected plainReply(message: string): Reply {
        return <Reply>{
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
    protected formattedReply(message: string): Reply {
        return <Reply>{
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

    /**
     * Add a reply to the output. Should be at least VoiceAssistant.plainReply().
     * @param {Reply} reply The reply you want to add.
     */
    addReply(reply: Reply) {
        this.replies.push(reply);
    }

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

    /**
     * Ask for permission to access some data e.g. the location or the name of the user.
     * @param {string} reason The reason which should been told the user why you are asking for this permission(s).
     * @param {VoicePermission|string|(VoicePermission|string)[]} permissions ask for a predefined VoicePermission or a
     * custom string or an array of them which has to been supported by the target platform.
     * @returns {Reply|undefined} returns the Reply with the permission request on supported platforms or undefined if
     * there is at least one unsupported permission in the request of the list of permissions is empty.
     */
    abstract requestPermission(reason: string, permissions: VoicePermission | string | (VoicePermission | string)[]): Reply | undefined;
}

/**
 * Tracking interface of the ChatbotBase.
 */
export interface TrackingProvider {
    /** The name of the tracking interface */
    name: string;
    /** @deprecated */
    logging: boolean;

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
    // Will be added in a later release for Alexa
    /** Read the to do list. */
    //ReadToDos,
    /** Write the to do list. */
    //WriteToDos,
}