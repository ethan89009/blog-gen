import OpenAI from "openai";

const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: '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',
  });
const models = ["google/gemma-3-27b-it:free","meta-llama/llama-4-maverick:free","openrouter/quasar-alpha","google/gemini-2.5-pro-exp-03-25:free","qwen/qwen2.5-vl-32b-instruct:free","google/gemini-2.0-pro-exp-02-05:free","google/gemini-2.0-flash-exp:free"]

const model = models[1]

const response_format = {
  "type": "json_schema",
  "json_schema": {
    "name": "topic",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "topic": {
          "type": "string",
          "description": "topic name given"
        },
        "instagram": {
          "type": "object",
          "properties":{
            "simple": {
              "type": "string",
              "description": "simple instagram post"
            },
            "creative": {
              "type": "string",
              "description": "creative instagram post"
            },
            "provocative": {
              "type": "string",
              "description": "provocative instagram post"
            }
          },
          "description": "instagram post"
        },
        "blog": {
          "type": "object",
          "properties": {
            "simple": {
              "type": "string",
              "description": "simple blog post"
            },
            "creative": {
              "type": "string",
              "description": "creative blog post"
            },
            "provocative": {
              "type": "string",
              "description": "provocative blog post"
            }
          },
          "description": "blog post"
        },
        "calculator": {
          "type": "string",
          "description": "calculator ideas based on topic"
        },
        "image": {
          "type": "string",
          "description": "image prompt for blog or instagram"
        },
        "refs": {
          "type": "array",
          "items": {
            "type": "string",
            "description": "list of references taken"
          }
        },
        "keywords": {
          "type": "string",
          "description": "keywords related to the topic, array of keywords"
        }
      },
      "required": ["topic", "instagram", "blog", "calculator", "image", "refs", "keywords"],
      "additionalProperties": false
    }
  }
}

const prompt = `I want to create short nuggets of information and insights that can be consumed easily—learn from all the short-form content popular on Instagram Reels, YouTube shorts, TikTok, etc. 
The goal is to improve financial literacy, and I want it to be the most entertaining content written on financial literacy. This should compel users to scroll through these posts and read the blogs whenever they have time to kill. So the bar is high—see if you can rise to it. Please use trusted sources
Here are the things you gotta generate 

It needs to 

Content instructions : 
Start with an engaging hook 
have very easy-to-understand content, 
Needs to be short, like a social media post 
Whenever relevant, design a calculator so the user can do what-if scenarios to bring the topic to life. for example , for a topic like how to balance income with spending a visualization that will allow user to move an income slider and show how much you save for spending in later phase of life vs spending right now. 

Needs to be designed for a mobile experience. So brevity and simplicity are key. 
The target audience is Gen Z, early career folks - use appropriate language
Do a social media post and a blog post one (size the blog post using the learnings from the most engaged content on social platforms). 
The social media post should hook the reader and direct them to the blog for more info. |For the social media post dont add a lot of emojis just in text, dont add brackets like for [LINK IN BIO] i just want modest use of emojis like 2 or 4.

Do a deep dive and be as creative as possible. Assume that the readers know nothing. 
Provide reputable sources and references (no more than three refs for each blog post) 
Create three options for the social media post and the blog post. 
The blog post should be atleast 250 word or a 5 minute read and it should be a quality read, it should be easy to read and generate atleast 500 words and structure into sections for the blogs.

One is simple and direct, 
One is very creative 
One is edgy and provocative 

I have a format that you should follow below , please reply in JSON string and not json markdown. add line breaks for the blog post , return as one line json string, DO NOT USE JSON MARKDOWN. AND DONT USE \BOXED{} OR ANY FORMATTING PLEASE.
{
"topic":"topic name",
"instagram":{
"simple":"simple instagram post",
"creative":"creative instagram post",
"provocative":"provocative instagram post"
},
"blog":{
"simple":"simple blog post  ",
"creative":"creative blog post ",
"provocative":"provocative blog post "
},
"calculator":"give some ideas for the calculator based on topic",
"image":"explain what image would fit the blog or instagram, like a prompt to generate the image or words to search an image using unsplash",
"refs":["list of references taken"],
"keywords":"keywords related to the topic, array of keywords",
}
All variants must help the financially illiterate person understand the concepts and appreciate the right choices.
Do all of the above for each of the listed top
REPLY ONLY USING JSON STRING AND DONT GIVE ANY TEXT BEFORE THE JSON STRING JUST THE RESPONSE.
topic :
College students , ways to reduce debt in early career`

async function main() {
    console.log("Starting OpenAI API call...");
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
      {
        role: 'user',
        content: prompt,
      },
      ],
    });

    console.clear();
    console.log("OpenAI API call completed.");
    console.log("Response:");
    console.log(completion.choices[0].message.content);
    // const jsonobj = JSON.parse(completion.choices[0].message.content);
    // console.log(jsonobj);
  }



main().catch((error) => {
    console.error('Error:', error);
  });
