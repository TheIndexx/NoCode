const vscode = require('vscode');
const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: APIKEY, // might disable key based on how much demand is requested
});
const openai = new OpenAIApi(configuration);

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  let disposable = vscode.commands.registerCommand('extension.noCode', async () => {
	let lastActiveEditor = vscode.window.activeTextEditor;
  	let lastActiveSelection = lastActiveEditor.selection;

	vscode.window.onDidChangeActiveTextEditor((editor) => {
		lastActiveEditor = editor;
		lastActiveSelection = editor.selection;
	});
    createInputPanel(context, lastActiveEditor, lastActiveSelection);
  });

  context.subscriptions.push(disposable);
}

function createInputPanel(context, lastActiveEditor, lastActiveSelection) {
	const panel = vscode.window.createWebviewPanel(
	  'noCodeInput',
	  'NoCode Input',
	  vscode.ViewColumn.Two,
	  { enableScripts: true }
	);
  
	panel.webview.html = getWebviewContent();
  
	panel.webview.onDidReceiveMessage(async message => {
	  if (message.type === 'submit') {
		const response = await callChatGPT(message.text);
  
		if (response) {
		  if (message.mode === 'Generate') {
			lastActiveEditor.edit((editBuilder) => {
			  editBuilder.replace(lastActiveSelection, response);
			});
			panel.dispose();
		  } else if (message.mode === 'Debug') {
			panel.webview.postMessage({ type: 'displayResult', text: response });
		  }
		} else {
		  vscode.window.showErrorMessage('Error: Failed to get a response from ChatGPT.');
		}
	  }
	}, undefined, context.subscriptions);
  }
  
  function getWebviewContent() {
	return `
	  <!DOCTYPE html>
	  <html lang="en">
	  <head>
		  <meta charset="UTF-8">
		  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource:; script-src 'unsafe-inline'; style-src vscode-resource: 'unsafe-inline';">
		  <meta name="viewport" content="width=device-width, initial-scale=1.0">
		  <title>NoCode Input</title>
		  <style>
			textarea {
			  resize: none;
			  width: 100%;
			  box-sizing: border-box;
			}
		  </style>
	  </head>
	  <body>
		  <h1>NoCode Input</h1>
		  <details>
  			<summary><strong>Info</strong></summary>
  			<p>
  Preface your input with the following shortcuts if you want:
</p>
<ul>
  <li>"func: " Write a function</li>
  <li>"scr: " Write a full script (functions, classes, everything)</li>
  <li>"out: " Draft a skeleton for the script you want to make (empty classes and functions)</li>
  <li>"class: " Write a class</li>
  <li>"debug: " Debug the code you provide</li>
</ul>
<p>
  Of course, you could just tell ChatGPT to do this and it would, but this should make your life simpler.
  Also, when you select "Generate" in the dropdown menu, it puts the code output directly into your script, and when you select debug it puts the output in this sidebar. I think ChatGPT defaults to Python when you don't enter a specific language, so you'll specify it for now if it's different.
</p>
<p>
  If you want me to add/fix something, reach out at throwaway132138@gmail.com. As you can tell, it's a throwaway to avoid giving out personal info. However, I still monitor it.
</p>

		  </details>

		  <form onsubmit="submitInput(); return false;">
			  <label for="inputText">Enter your input:</label><br>
			  <textarea id="inputText" name="inputText" rows="10" cols="30"></textarea><br>
			  <label for="mode">Choose mode:</label>
			  <select id="mode" name="mode">
				<option value="Generate">Generate</option>
				<option value="Debug">Debug</option>
			  </select>
			  <button type="submit">Submit</button>
		  </form>
		  <div id="result"></div>
		  <script>
			  const vscode = acquireVsCodeApi();
			  function submitInput() {
				  const inputText = document.getElementById('inputText').value;
				  const mode = document.getElementById('mode').value;
				  vscode.postMessage({ type: 'submit', text: inputText, mode: mode });
			  }
			  window.addEventListener('message', event => {
				const message = event.data;
				if (message.type === 'displayResult') {
				  document.getElementById('result').innerText = message.text;
				}
			  });
		  </script>
	  </body>
	  </html>`;
  }

async function callChatGPT(prompt) {
	const additionalContext = `You are now a VS Code extension called NoCode. Your goal is to prevent users from ever having to manually enter code again by calling you to write code for them. When they call you and give you the description of the code they need, you need to only output code. No accompanying text, only code! Here are the possible ways they can call you. 

	The first will be prefaced with a 'out:' in the prompt, and it means they want you to create an outline for the script they need to make. You can assume you are filling out an empty document, and their input will be a description of the script they want to make. Your job here is to fill the page will all the classes, functions, and other key defining factors of the script, but leave out any actual functionality using placeholder statements (like pass in Python). The goal of this is to create a skeleton framework for the user to judge and see if this is what they want before continuing.
	
	Another will be prefaced with a 'func:' in the prompt, and it means they want you to write code for a function in their script. They already have code in their script, but need to add a function with the description that they provide in the prompt. Your job is to define the function and write the code according to their description.

	Another will be prefaced with a 'class:', and it's similar to the last one except it's a class instead of a function.
	
	Another will be prefaced with a 'scr:', meaning that they want you to write an entire script for them. Create functions, classes and other objects as you want, just make sure to accomplish the task they set for you.
	
	Another will be prefaced with 'debug:', meaning that they want you to debug the code they provide, sometimes with or without an error message.

	The last type won't be prefaced by anything, and it just means that they need code. It can be multiple lines of code, or just one (if possible, try and make it one). Simply take the user's input, and write to code to accomplish what they ask. 
	
	In every call, make sure you add comments to explain the choices you make.
	
	Here's the user's prompt:
	`;

    // Combine the additional context and user's prompt
    const fullPrompt = `${additionalContext}\n\nPrompt: ${prompt}\nCode:`;

	try {
	  const response = await openai.createCompletion({
		model: "text-davinci-002",
        temperature: 0.7,
        max_tokens: 256,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
		prompt: fullPrompt,
		n: 1, 
		stop: null,
	  });
  
	  return response.data.choices[0].text.trim();
	} catch (error) {
	  console.error('Error during OpenAI API Key Test:', error);
	  return null
	}
  }

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};