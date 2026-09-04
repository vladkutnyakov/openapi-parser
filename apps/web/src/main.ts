import { createApp } from 'vue';
import { App, setHost } from '@openapi-parser/ui';
import { createWebHost } from './host-web';

// setHost до createApp: useHooks и useTheme читают хранилище на этапе выполнения модуля
setHost(createWebHost());

createApp(App).mount('#app');
