declare function require(path: string): any;

export interface Context {
    [key: string]: any
}

export interface Translations {
    [language: string]: Translation
}

export interface Translation {
    [key: string]: string | string[]
}

export abstract class VoiceAssistant {
    private static sprintf = require('sprintf-js');
    protected language: string;
    private trackers: TrackingProvider[];
    private platforms: VoicePlatform[];

    constructor() {
        this.translations = this.loadTranslations();
        this.platforms = this.loadPlatforms();
        this.trackers = this.loadTracker();
    }

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
                    // TODO contact the messages to get two resulting for compatibility with other platforms
                    for(let i = 0; i < output.messages.length; i++) {
                        if(output.messages[i].platform === platform.platformId()) {
                            console.log('< ' + output.messages[i].debug())
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
            output.messages.forEach((msg) => {
                if(msg.type === 'plain' && msg.platform === '*') {
                    output.message = msg.render();
                }
            });
            this.trackers.forEach(tracker => tracker.trackOutput(output));
            response.end(JSON.stringify(resp));
        });
        return promise;
    }

    protected abstract loadPlatforms(): VoicePlatform[]

    protected loadTracker(): TrackingProvider[] {
        return []
    }

    protected abstract loadTranslations(): Translations

    public abstract reply(input: Input): Output;

    // Translations support

    private translations: Translations;

    protected t(key: string, ...args): string {
        let translation = this.translations[this.language][key];
        if(translation instanceof Array) {
            translation = translation[Math.floor(Math.random() * translation.length)]
        }
        const newArg = [translation];
        args.forEach(arg => newArg.push(arg));
        return VoiceAssistant.sprintf.sprintf.apply(this, newArg);
    }

    protected tr(key: string, ...args): string {
        const array = this.t(key, args);
        return array[Math.floor(Math.random() * array.length)]
    }

    protected plainMessage(message: string): Message {
        return <Message>{
            platform: '*',
            type: 'plain',
            render: () => message,
            debug: () => message
        };
    }

    protected formattedMessage(message: string): Message {
        return <Message>{
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

export abstract class IOMessage {
    id: string;
    userId: string;
    sessionId: string;
    platform: string;
    language: string;
    time: Date;
    intent: string;
    inputMethod: InputMethod;
    message: string;
    context: Context;

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

export class Input extends IOMessage {
    reply(): Output {
        return new Output(this.id + '.reply', this.userId, this.sessionId, this.platform, this.language, this.intent, "", this.context)
    }
}

export class Output extends IOMessage {
    messages: Message[] = [];
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

    addMessage(message: Message) {
        this.messages.push(message);
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

export enum InputMethod {
    voice,
    text,
    touch
}

export abstract class Message {
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