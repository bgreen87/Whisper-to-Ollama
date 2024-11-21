This plugin addes a "Transcribe" button below audio files which sends the file to Whisper for transcription then Ollama for further processing.

The Whisper service used to devlope this plug in is [whisper-asr-webservice]([url](https://github.com/ahmetoner/whisper-asr-webservice)). **Note that CORS needs to be addressed** to allow queries to be sent, one solution is avaiable from dahifi [here]([url](https://github.com/ahmetoner/whisper-asr-webservice/issues/119#issuecomment-1924453707)).

The Ollama service is [ollama]([url](https://github.com/ollama/ollama)).

I'm just a dude that played around with ChatGPT to build this and not too far from a monkey beating a keyboard to figure it out. Open to critizisms, suggestions, and curse words.
