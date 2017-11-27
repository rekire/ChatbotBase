# ChatbotBase
A simple node.js framework to write chatbots for differnt platforms like Google Home and Amazon Alexa at once.

## Usage

In order to use this library you need to install the `chatbotbase` module and of cause the platforms you want to support.
Currently are the following platforms supported:
- Google Assistant and Google Home via Dialogflow: `chatbotbase-dialogflowplatform`
- Amazon Alexa: `chatbotbase-alexaplatform`

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

```javascript
import {Input, Output, VoiceAssistant, VoicePlatform, Translations} from 'chatbotbase';
import {Dialogflow} from 'chatbotbase-dialogflowplatform';
import {Alexa} from 'chatbotbase-alexaplatform';

export class CSCRM extends VoiceAssistant {
    constructor() {
        super();
    }

    loadPlatforms(): VoicePlatform[] {
        return [new Dialogflow(), new Alexa()];
    }

    reply(input: Input): Output {
        const reply = input.reply();
        switch(input.intent) {
        case 'LaunchRequest':
        case 'Default Welcome Intent':
            reply.addMessage(this.plainMessage(this.t('WELCOME')));
            reply.addSuggestion(this.suggestion(this.t('BYE')));
            reply.setExpectAnswer(true);
            break;
        case 'Exit':
        case 'SessionEndedRequest':
            reply.addMessage(this.plainMessage(this.t('STOP_MESSAGE')));
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

```javascript
loadTracker(): TrackingProvider[] {
    return [new Chatbase('<your-api-key>', '<your-app-version>')];
}
```

## ToDos
* Tests
* Coverage
* Wiki how to create own platforms/tracking provider
