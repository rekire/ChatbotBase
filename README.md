# ChatbotBase
A simple node.js framework to write chatbots for differnt platforms like Google Home and Amazon Alexa at once.

  [![NPM Version][npm-image]][npm-url]
  [![NPM Downloads][downloads-image]][downloads-url]
  
## Usage

In order to use this library you need to install the `chatbotbase` module and of cause the platforms you want to support.
Currently are the following platforms supported:
- Google Assistant and Google Home via Dialogflow: [`chatbotbase-dialogflowplatform`][dialogflowplatform]
- Amazon Alexa: [`chatbotbase-alexaplatform`][alexaplatform]

If you want to support both platforms use this commands:

    npm init
    npm install chatbotbase chatbotbase-dialogflowplatform chatbotbase-alexaplatform

The next Step is to write your own chatbot by extending the `VoiceAssistant` class. The most important methods are:
- `loadPlatforms()`, there you define the platforms you actually want to support
- `reply()` where you get the input from the user and you return your answer
- `loadTranslations()` where you define your translations
- optional `loadTracker()` if you want to track the input of the user e.g. with chatbase

### Basic example

Here is the full TypeScript code to write a skill/action supporting Alexa and the Google Assistant. This example
welcomes you with a random phrase and gives the user the suggestion to say bye (on supported platforms here just Google
Assistant). This example supports multiple languages here German and English.

```typescript
import {Input, Output, VoiceAssistant, VoicePlatform, Translations} from 'chatbotbase';
import {Dialogflow} from 'chatbotbase-dialogflowplatform';
import {Alexa} from 'chatbotbase-alexaplatform';

export class MyChatBot extends VoiceAssistant {
    loadPlatforms(): VoicePlatform[] {
        return [new Dialogflow(), new Alexa()];
    }

    reply(input: Input): Output {
        const reply = input.reply();
        switch(input.intent) {
        case 'LaunchRequest':
        case 'Default Welcome Intent':
            reply.addReply(this.plainReply(this.t('WELCOME')));
            reply.addSuggestion(this.suggestion(this.t('BYE')));
            reply.setExpectAnswer(true);
            break;
        case 'Exit':
        case 'SessionEndedRequest':
            reply.addReply(this.plainReply(this.t('STOP_MESSAGE')));
            break;
        }
        return reply;
    }

    loadTranslations(): Translations {
        return {
            'de': {
                WELCOME: ['Hi', 'Hallo'],
                STOP_MESSAGE: ['Aufwiedersehen!', 'Bis bald.'],
                BYE: 'Tschüss'
            },
            'en': {
                WELCOME: ['Hi', 'Hello'],
                STOP_MESSAGE: ['Good bye!', 'See you soon.'],
                BYE: 'Bye'
            }
        };
    }
}
```

### Tracking
The ChatbotBase also allows you to track the input of the user e.g. with chatbase. To use just just import the
chatbaseplugin and overwrite the `loadTracker()` method like this:

```typescript
loadTracker(): TrackingProvider[] {
    return [new Chatbase('<your-api-key>', '<your-app-version>')];
}
```

Currently there are implementation the following tracker:
 - [Chatbase][chatbase-homepage]: [ChatbotBase-ChatbasePlugin][chatbaseplugin]

## ToDos
* Tests
* Coverage
* Wiki how to create own platforms/tracking provider

## License
  [Apache 2.0](LICENSE)

[npm-image]: https://img.shields.io/npm/v/chatbotbase.svg
[npm-url]: https://npmjs.org/package/chatbotbase
[downloads-image]: https://img.shields.io/npm/dm/chatbotbase.svg
[downloads-url]: https://npmjs.org/package/chatbotbase
[dialogflowplatform]: https://github.com/rekire/ChatbotBase-DialogflowPlatform
[alexaplatform]: https://github.com/rekire/ChatbotBase-AlexaPlatform
[chatbase-homepage]: https://chatbase.com/welcome
[chatbaseplugin]: https://github.com/rekire/ChatbotBase-ChatbasePlugin
