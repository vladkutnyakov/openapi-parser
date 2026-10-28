import { createApp } from 'vue';
import { App, setHost } from '@openapi-parser/ui';
import { createVscodeHost } from './host-vscode';
import { installCopyShortcut } from './copy-shortcut';
// импортируется только здесь: тема от VSCode нужна панели, но не веб-версии
import './vscode-theme.css';

const host = createVscodeHost();
// setHost до createApp: useHooks и useTheme читают хранилище при первом вызове
setHost(host);
installCopyShortcut(host);

createApp(App).mount('#app');
