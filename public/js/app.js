import { Narrator } from './narrator.js';
import { initLogin } from './login.js';
import { initQuiz } from './quiz.js';

Narrator.bindGlobalKeys();

const app = document.getElementById('app');
initLogin(app, player => initQuiz(app, player));
