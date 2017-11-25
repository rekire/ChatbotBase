# Custom Platforms

Great, you want to use ChatbotBase and want to know how to write a custom platform. Here is a brief overview what you need to do.

## Steps

1. Create a new class which extends `VoicePlatform`
2. Override `platformId()` and return a unique name to identify your platform. This is used to identify special formatted custom messages.
3. Override `isSupported(json: any)` which will get the request body of the caller, just check there if you support the input format with a boolean result.
4. Override `parse(body: any)` which will be invoked when you returned true in `isSupported()`, there you get again the request body. Here you should only parse the request and return a `Input` object.
5. Override `render(reply: Output)` which should return the json which the caller expects.

Optional:  
Add static functions to provide platform specific `Message`s, which include two fields and two functions:
 
- `platform` is a field which must contain the same value as your `platformId()`
- `type` which is used to identify the kind of message for your internal logic
- `render()` must return the json which is generated for this special message, just to encapsulate the generation logic.
- `debug()` must return a textual representation of the message for debugging and for logging
 
Where you actually render the message in the final json is up to you. Consider the Dialogflow platform implementation as a reference. There you can also see that some messages are rendered at differnt places depending on the actual type.