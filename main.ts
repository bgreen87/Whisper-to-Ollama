import { App, TFile, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	settingWhisperIP: string;
	settingOllamaIP: string;
	settingOllamaToggle: boolean;
	settingOllamaPrompt: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	settingWhisperIP: '192.168.1.10:9000',
	settingOllamaIP: '192.168.1.10:11434',
	settingOllamaToggle: false,
	settingOllamaPrompt: 'You are an avid Obsidian user. You can use Heading (#, ##, ###, optinonal), Ordered List, Unordered List, and other markdown syntax as part of your response as best as you see fit to present as much infomration at you can in a concise manner. Below is a transcription of an audio note. Remove any pauses and phrases like "hmmm" or "uhhh" or similar. Some of the information may make sense as bulleted or numbered lists. Do not restate any part of this prompt or explain how you arrived to your response.: '
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// Monitor the content of notes and add transcription buttons under audio files
        this.registerMarkdownPostProcessor(this.addTranscribeButtonToAudio);
		this.monitorNoteChanges();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}
	
	// Monitor content changes and dynamically add transcription buttons
	monitorNoteChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Ensure mutation.target is an HTMLElement (this is where audio elements would be)
                    const target = mutation.target as HTMLElement;
                    const audioElements = target.querySelectorAll('audio');
                    audioElements.forEach((audio: HTMLAudioElement) => {
                        this.addTranscribeButton(audio);
                    });
                }
            });
        });

        // Start observing the document body for changes
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    // Adds the "Transcribe" button below audio files in the note
    addTranscribeButtonToAudio = (el: HTMLElement) => {
        // Look for all audio elements in the note
        const audioElements = el.querySelectorAll('audio');

        audioElements.forEach((audio: HTMLAudioElement) => {
            // Add the button below if it doesn't already exist
            this.addTranscribeButton(audio);
        });
    };

    // Adds a "Transcribe" button below the specific audio element
    addTranscribeButton(audio: HTMLAudioElement) {
        // Check if a "Transcribe" button is already added
        if (!audio.parentElement?.querySelector('.transcribe-button')) {
            // Create a new button element
            const button = document.createElement('button');
            button.classList.add('transcribe-button');
            button.textContent = 'Transcribe';
            button.title = 'Transcribe Audio';
            button.style.marginTop = '10px';

            // Add an event listener to trigger transcription logic
            button.addEventListener('click', () => {
                this.transcribeAudio(audio);
            });

            // Append the button below the audio element
            audio.parentElement?.appendChild(button);
        }
    }

    // Sends the audio file to locally hosted Whisper for transcription and updates the note
	async transcribeAudio(audioElement: HTMLAudioElement) {
		const audioUrl = audioElement.src;
		const audioFileName = audioUrl.split('/').pop() || 'Unknown File';

		// Create and display a progress indicator
		const progressIndicator = document.createElement('div');
		progressIndicator.classList.add('transcription-progress');
		progressIndicator.textContent = `Transcribing: ${audioFileName}`;
		progressIndicator.style.marginTop = '10px';
		progressIndicator.style.fontStyle = 'italic';
		audioElement.parentElement?.appendChild(progressIndicator);

		let dotCount = 0;  // Keep track of the number of dots for the progress

		// Create an interval that updates the progress indicator every second
		const dotInterval = setInterval(() => {
			if (dotCount < 5) {
				progressIndicator.textContent = `Transcribing: ${audioFileName}${'.'.repeat(dotCount + 1)}`;
				dotCount++;
			} else {
				dotCount = 0;  // Reset to 0 after three dots
				progressIndicator.textContent = `Transcribing: ${audioFileName}`;
			}
		}, 500); // Update every second

		try {
			// Check if the Whisper server is available
			const serverAvailable = await this.checkWhisperServerAvailability();

			if (!serverAvailable) {
				new Notification('Whisper Server Unavailable', {
					body: 'The local Whisper server is not available. Please ensure it is running on port 9000.',
				});
				progressIndicator.textContent = 'Failed: Server Unavailable';
				clearInterval(dotInterval); // Clear interval
				setTimeout(() => progressIndicator.remove(), 3000); // Auto-remove after 3 seconds
				return; // Exit early
			}

			// Show a notification that transcription is in progress
			new Notification('Transcription Request', {
				body: `Transcribing: ${audioFileName}`,
			});

			// Fetch the audio file as a File object
			const response = await fetch(audioUrl);
			const audioFile = await response.blob();
			const file = new File([audioFile], audioFileName, { type: 'audio/mp3' });

			const formData = new FormData();
			formData.append('audio_file', file, audioFileName);

			// Send audio file to locally hosted Whisper API
			const transcription = await this.fetchTranscription(formData);

			let finalText = transcription;
			clearInterval(dotInterval); // Clear interval


			// If Ollama toggle is enabled, send the transcription with the prompt
			if (this.settings.settingOllamaToggle) {
				let dotCount = 0;  // Keep track of the number of dots for the progress

				// Create an interval that updates the progress indicator every second
				const dotInterval = setInterval(() => {
					if (dotCount < 5) {
						progressIndicator.textContent = `Processing with Ollama${'.'.repeat(dotCount + 1)} \n \n Whisper Transcription: \n ${finalText}`;
						dotCount++;
					} else {
						dotCount = 0;  // Reset to 0 after three dots
						progressIndicator.textContent = `Processing with Ollama \n \n Whisper Transcription: \n ${finalText}`;
					}
				}, 500); // Update every second

				finalText = await this.processWithOllama(transcription);
			}

			clearInterval(dotInterval);

			// Update the transcription result below the audio element
			this.displayTranscriptionResult(audioElement, finalText);
			progressIndicator.textContent = 'Transcription Complete';
		} catch (error) {
			console.error('Transcription failed:', error);
			progressIndicator.textContent = 'Failed: Transcription Error';
		} finally {
			// Clear the interval and remove the progress indicator after the process is done
			clearInterval(dotInterval);
			setTimeout(() => progressIndicator.remove(), 3000); // Auto-remove after 3 seconds
		}
	}

    // Fetches transcription from locally hosted Whisper API
    async fetchTranscription(formData: FormData) {
		const apiUrl = `http://${this.settings.settingWhisperIP}/asr?output=json`; // Use settingsWhisperIP
    
		const response = await fetch(apiUrl, {
			method: 'POST',
			body: formData, // Send the FormData object directly
		});
	
		if (!response.ok) {
			throw new Error('Failed to fetch transcription');
		}
	
		const result = await response.json();
		return result.text; // Extract the transcription text
    }

	// Sends text to Ollama server for processing with the prompt
	async processWithOllama(transcription: string): Promise<string> {
		const apiUrl = `http://${this.settings.settingOllamaIP}/api/chat`; // Correct endpoint
		const payload = {
			model: 'llama3.2', // Use the specified model
			messages: [
				{
					role: 'user',
					content: `${this.settings.settingOllamaPrompt}\n\n${transcription}` // Combine prompt and transcription
				}
			],
			stream: false // Ensure the response is not streamed
		};

		try {
			const response = await fetch(apiUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error('Failed to process text with Ollama');
			}

			const resData = await response.json();
			return resData.message?.content || 'Ollama returned no text.';
		} catch (error) {
			console.error('Error processing with Ollama:', error);
			return 'Failed to process text with Ollama.';
		}
	}

    // Displays the transcription result below the audio element
    displayTranscriptionResult(audioElement: HTMLAudioElement, transcription: string) {
		// Find the "Transcribe" button element and its parent
		const transcribeButton = audioElement.parentElement?.querySelector('.transcribe-button');
		
		if (!transcribeButton) {
			new Notice('Transcribe button not found!');
			return;
		}

		// Get the active editor (the one currently being viewed)
		const activeEditor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;

		if (!activeEditor) {
			new Notice('No active editor found!');
			return;
		}

		// Find the position of the "Transcribe" button in the note content
		const buttonPosition = transcribeButton.parentElement;

		if (!buttonPosition) {
			new Notice('Could not find the position for the transcription.');
			return;
		}

		// Ensure there's no leading or trailing whitespace in the transcription
		transcription = transcription.trim();

		// Get the current cursor position (line where the insertion should occur)
		const cursor = activeEditor.getCursor();
		
		// Insert the transcription directly below the button, without leading space
		const lineAtButton = cursor.line + 1; // Insert below current line, adjust as needed

		// Insert the transcription at the location below the "Transcribe" button
		activeEditor.replaceRange(transcription, { line: lineAtButton, ch: 0 });

		// Optionally, move the cursor to the end of the inserted text
		const newCursor = { line: lineAtButton, ch: transcription.length };
		activeEditor.setCursor(newCursor);
    }

    // Checks if the Whisper server is available on port 9000
    async checkWhisperServerAvailability() {
        const serverUrl = `http://${this.settings.settingWhisperIP}`;
        try {
            const response = await fetch(serverUrl);
            // If we get a successful response, assume the server is available
            return response.ok;
        } catch (error) {
            console.error('Whisper server is not available:', error);
            return false;
        }
    }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

        // Add a header (Title)
        const headerEl = containerEl.createEl('h2', {
            text: 'Whisper to Ollama Settings'  // Set the text for the header
        });

		new Setting(containerEl)
			.setName('Whisper Address')
			.setDesc('Enter address to send audio files to get converted to text')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.settingWhisperIP)
				.onChange(async (value) => {
					this.plugin.settings.settingWhisperIP = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
            .setName("Enable Ollama")
            .setDesc("Toggle to send text to Ollama with prompt below.")
            .addToggle(toggle => 
                toggle
                    .setValue(this.plugin.settings.settingOllamaToggle)
                    .onChange(async (value) => {
                        this.plugin.settings.settingOllamaToggle = value;
                        await this.plugin.saveSettings();
                    })
            );

		new Setting(containerEl)
			.setName('Ollama Address')
			.setDesc('Enter address to send Whisper output with prompt below.')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.settingOllamaIP)
				.onChange(async (value) => {
					this.plugin.settings.settingOllamaIP = value;
					await this.plugin.saveSettings();
				}));

		// Create a larger text field (multiline textarea)
		new Setting(containerEl)
			.setName("Ollama Prompt")
			.setDesc("This prompt will be sent ahead of Whisper text to let Ollama know how to process.")
			.addTextArea(textarea => {
				textarea
					.setValue(this.plugin.settings.settingOllamaPrompt)
					.onChange(async (value) => {
						this.plugin.settings.settingOllamaPrompt = value;
						await this.plugin.saveSettings();
					})
					// Make the textarea larger by adjusting its rows and columns
					textarea.inputEl.setAttribute('rows', '10')  // Adjust the number of visible rows
                    textarea.inputEl.setAttribute('cols', '50') // Adjust the number of visible columns
			});
	}
}
