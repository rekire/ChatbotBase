# ChatbotBase
A simple node.js framework to write chatbots for differnt platforms like Google Home and Amazon Alexa at once.

## Basic example

Here is the full TypeScript code to write a skill/action supporting Alexa and the Google Assistant. This example
welcomes you with a random phrase and gives the user the suggestion to say bye (on supported platforms here just Google
Assistant). This example supports multiple languages here German and English.

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

## Tracking
The ChatbotBase also allows you to track the input of the user e.g. with chatbase. To use just just import the
chatbaseplugin and overwrite the `loadTracker()` method like this:

    loadTracker(): TrackingProvider[] {
        return [new Chatbase('<your-api-key>', '<your-app-version>')];
    }

## ToDos
* Tests
* Coverage
* Wiki how to create own platforms/tracking provider