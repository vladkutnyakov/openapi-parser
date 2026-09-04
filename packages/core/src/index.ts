/**
 * Публичный вход пакета: чистая логика, работающая и в браузере, и в Node.
 * Всё, что требует Node-API (чтение файлов, сеть), живёт в отдельном входе `./node` —
 * иначе бандлер веб-версии втянул бы `node:fs` в браузерный бандл.
 */
export * from './openapi-types';
export * from './errors';
export * from './endpoint-index';
export * from './resolver';
export * from './generator';
export * from './hooks';
export * from './presets';
export * from './ts-parser';
export * from './type-diff';
export * from './url-state';
export * from './recent-sources';
