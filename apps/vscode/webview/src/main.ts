import { createApp } from 'vue';
import { App, setHost } from '@openapi-parser/ui';
import { createVscodeHost } from './host-vscode';
// импортируется только здесь: тема от VSCode нужна панели, но не веб-версии
import './vscode-theme.css';

// setHost до createApp: useHooks и useTheme читают хранилище при первом вызове
setHost(createVscodeHost());

createApp(App).mount('#app');
