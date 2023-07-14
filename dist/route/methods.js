import { OpenAI } from "langchain/llms";
import { ChatPromptTemplate, HumanMessagePromptTemplate, PromptTemplate, SystemMessagePromptTemplate } from "langchain/prompts";
import { ChatOpenAI } from "langchain/chat_models";
import { HumanChatMessage, SystemChatMessage } from "langchain/schema";
// import { LLMChain } from "langchain/chains"
import { PassThrough } from "stream";
import { CallbackManager } from "langchain/callbacks";
import dotenv from "dotenv";
import { PineconeClient } from '@pinecone-database/pinecone';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
dotenv.config();
// import makeChain from './utils/makechain';
// import  {pinecone}  from '../utils/pinecone-client';
// import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from './config/pinecone';

const CONDENSE_PROMPT = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone question:`;
const QA_PROMPT = `You are a helpful AI assistant. Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say you don't know. DO NOT try to make up an answer.
If the question is not related to the context, politely respond that you are tuned to only answer questions that are related to the context.

{context}

Question: {question}
Helpful answer in markdown:`;
function makeChain(vectorstore) {
  const model = new OpenAI({
    temperature: 0,
    // increase temperature to get more creative answers
    modelName: 'gpt-3.5-turbo' // change this to gpt-4 if you have access
  });

  const chain = ConversationalRetrievalQAChain.fromLLM(model, vectorstore.asRetriever(), {
    qaTemplate: QA_PROMPT,
    questionGeneratorTemplate: CONDENSE_PROMPT,
    returnSourceDocuments: true // The number of source documents returned is 4 by default
  });

  return chain;
}
;
async function initPinecone() {
  try {
    const pinecone = new PineconeClient();
    console.log(process.env.PINECONE_ENVIRONMENT, 'process.env.PINECONE_ENVIRONMENT ');
    await pinecone.init({
      environment: process.env.PINECONE_ENVIRONMENT || '',
      // this is in the dashboard
      apiKey: process.env.PINECONE_API_KEY || ''
    });
    return pinecone;
  } catch (error) {
    console.log('error', error);
    throw new Error('Failed to initialize Pinecone Client');
  }
}
let pinecone = initPinecone().then(initializedPinecone => {
  pinecone = initializedPinecone;
}).catch(error => {
  console.error('Error initializing Pinecone Client:', error);
  throw error;
});
export const methods = [{
  id: "assistant",
  route: "/assistant",
  method: "post",
  description: "This is an assistant route",
  inputVariables: ["question", "history"],
  execute: async input => {
    console.log(input, "input");
    const question = input.question;
    const history = input.history;
    // // OpenAI recommends replacing newlines with spaces for best results
    const sanitizedQuestion = question.trim().replaceAll('\n', ' ');
    try {
      const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

      /* create vectorstore */
      const vectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings({}), {
        pineconeIndex: index,
        textKey: 'text',
        namespace: process.env.PINECONE_NAME_SPACE || 'pdf-test' // namespace comes from your config folder
      });

      const chain = makeChain(vectorStore);
      // Ask a question using chat history
      const response = await chain.call({
        question: sanitizedQuestion,
        chat_history: history || []
      });
      console.log(question, 'response', response.text);
      return response;
    } catch (error) {
      console.log('error', error);
      res.status(500).json({
        error: error || 'Something went wrong'
      });
    }
  }
}];