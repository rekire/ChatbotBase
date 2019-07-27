export declare type ReplyBuilder<T = {}> = new (...args: any[]) => T;
/**
 * The context is basically a map with a string as key holding any possible value.
 */
export interface Context {
    [key: string]: any;
}
/**
 * The key of the translations is the language of the user in the [IETF language tag](https://en.wikipedia.org/wiki/IETF_language_tag)
 * format or at least the first two letters (also known as [ISO 639-1](https://en.wikipedia.org/wiki/ISO_639-1)) if you
 * don't care for the actual region.
 */
export interface Translations {
    [language: string]: Translation;
}
/**
 * The translation itself is a map of a key and the actual translation or a array of possible translations where one
 * translation will be randomly chosen. This is useful to give the user variations in answers. You can use placeholders
 * for formatted variables. Check also the syntax of [sprintf-js](https://www.npmjs.com/package/sprintf-js).
 */
export interface Translation {
    [key: string]: string | string[];
}
/**
 * A message containing the ssml and display text.
 */
export declare class Message {
    constructor(displayText: string, ssml: string);
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
    getDisplayText(input: IOMessage, key: string, ...args: string[] | Translation[]): string | null;
    /**
     * Returns the SSML-String of the given key, for the locale of the user's request.
     * @param input The parsed request, this might be helpful if you want to provide platform specific translations.
     * @param {string} key The key of the translation.
     * @param args The var args of the optional variables in the output.
     * @returns {string} containing the actual string.
     */
    getSsml(input: IOMessage, key: string, ...args: string[] | Translation[]): string | null;
    /**
     * Returns Message of the given key, for the locale of the user's request.
     * @param input The parsed request, this might be helpful if you want to provide platform specific translations.
     * @param {string} key The key of the translation.
     * @param args The var args of the optional variables in the output.
     * @returns {string} containing the actual string.
     */
    getMessage(input: IOMessage, key: string, ...args: string[] | Translation[]): Message | null;
}
/**
 * Simple translation holder, based on the Translations data structure.
 */
export declare class MapTranslator implements TranslationProvider {
    private readonly translations;
    /**
     * Creates a new instance of the MapTranslator.
     * @param translations The actual data you want to provide.
     */
    constructor(translations: Translations);
    getDisplayText(input: IOMessage, key: string, ...args: string[]): string | null;
    getSsml(input: IOMessage, key: string, ...args: any[]): string | null;
    getMessage(input: IOMessage, key: string, ...args: any[]): Message | null;
}
/**
 * The abstract base class for your actual implementation.
 */
export declare abstract class VoiceAssistant {
    protected language: string;
    private trackers;
    private platforms;
    private selectedPlatform;
    private intentHandlers;
    /**
     * The constructor loads the translations, platforms and the optional tracker.
     */
    protected constructor();
    /**
     * The handler of the platform, this will render all replies, suggestions and send the platform specific response
     * out. This will also invoke the trackers async using a promise.
     * @param request the incoming request.
     * @param response Is a object where the `end()` function will be called to send the response to the calling client.
     * To be honest this does not really make sense and will be changed later to a simple callback.
     * @returns {Promise<Reply>} A promise which you should return to allow closing the connection and let the
     * process life until the tracking code ends.
     */
    handle(request: any, response: any): Promise<Reply>;
    private createReply;
    private logReply;
    /** Callback to load the supported platforms your implementation. */
    protected abstract loadPlatforms(): VoicePlatform[];
    /** Override this method to choose the tracking platforms you want. By default this is an empty list. */
    protected loadTracker(): TrackingProvider[];
    /** Callback to create the TranslationProvider. */
    protected abstract provideTranslations(): TranslationProvider;
    private searchIntentHandlers;
    /**
     * This function generates the output message which will be used for rendering the output and the tracking providers.
     */
    abstract createFallbackReply(input: Input): Output | Promise<Output>;
    protected readonly translations: TranslationProvider;
}
/**
 * The abstract base class for input and output messages.
 */
export declare abstract class IOMessage {
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
    constructor(id: string, userId: string, sessionId: string, language: string, platform: string, time: Date, intent: string, inputMethod: InputMethod, message: string, context: Context);
}
/**
 * The normalized message you got from the platform which could parse the request.
 */
export declare class Input extends IOMessage {
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
    constructor(id: string, userId: string, sessionId: string, language: string, platform: string, time: Date, intent: string, inputMethod: InputMethod, message: string, context: Context, accessToken: string);
}
/**
 * The output message
 */
export declare class Output extends IOMessage {
    replies: Reply[];
    suggestions: Suggestion[];
    retentionMessage: string;
    expectAnswer: boolean;
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
    constructor(id: string, userId: string, sessionId: string, platform: string, language: string, intent: string, message: string, context: Context);
    /**
     * Add a reply to the output. Should be at least VoiceAssistant.textReply().
     * @param {Reply} reply The reply you want to add.
     */
    addReply(reply: Reply): void;
    /**
     * Add a suggestion to the output.
     * @param {Suggestion} suggestion The suggestion to add.
     */
    addSuggestion(suggestion: Suggestion): void;
    /**
     * Add a retention message which will be send when setExpectAnswer() was set to true.
     * @param {string} message The message which should be said after a platform specific timeout.
     */
    setRetentionMessage(message: string): void;
    /**
     * Set to `true` to indidate that you expect an answer and that this conversation should not end now.
     * @param {boolean} answerExpected
     */
    setExpectAnswer(answerExpected: boolean): void;
}
export declare class DefaultReply extends Output {
    private readonly translations;
    constructor(input: Input, translations: TranslationProvider);
    /**
     * Defines a text message as response. Should be handled by all platforms.
     * @param {string} message the plain text message.
     * @returns {Reply} the message object which should be added to the output.
     */
    textReply(message: string): Reply;
    /**
     * Defines a SSML formatted message as response. Should be handled by all platforms.
     * @param {string} message the formatted text message.
     * @returns {Reply} the message object which should be added to the output.
     */
    voiceReply(message: string): Reply;
    /**
     * Creat a plain text suggestion for supported platforms.
     * @param {string} label The label to click on.
     * @returns {Suggestion}
     */
    suggestion(label: string): Suggestion;
    t(key: string, ...args: string[] | Translation[]): string | null;
    createMessage(key: string, ...args: string[] | Translation[]): Message | null;
}
/**
 * The input method the user used to start the current intent.
 */
export declare enum InputMethod {
    /** The input was made by voice. */
    voice = 0,
    /** The input was made by keyboard. */
    text = 1,
    /** The input was made by touch e.g. via a suggestion or a button on a card. */
    touch = 2
}
/**
 * The base class for any replies.
 */
export declare abstract class Reply {
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
    abstract render(): any;
    /**
     * @returns {string} The plain text representation for debugging.
     */
    abstract debug(): string;
}
/**
 * A suggestion which should be shown the user.
 */
export declare abstract class Suggestion {
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
export declare abstract class VoicePlatform {
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
    abstract parse(body: any): Input;
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
    verify(request: VerifyDataHolder, response: any): Promise<boolean> | boolean;
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
export declare enum VoicePermission {
    /** The exact position of the user e.g. the GPS position. */
    ExactPosition = 0,
    /** The in the profile saved position of the user mostly the zip code and the country. */
    RegionalPosition = 1,
    /** The name of the user. */
    UserName = 2,
    /** Read the to do list. */
    ReadToDos = 3,
    /** Write the to do list. */
    WriteToDos = 4
}
export interface IntentHandler {
    isSupported(input: Input): boolean;
    createOutput(input: Input, translations: TranslationProvider): Output | Promise<Output>;
}
