/**
 * Публичный вход UI-пакета. Приложение-оболочка (веб или расширение) собирает
 * реализацию HostBridge, регистрирует её через setHost и монтирует App —
 * больше ему знать нечего.
 */
export { default as App } from './App.vue';
export * from './host';
// Locale — часть контракта хоста: оболочка обязана отдать язык окружения
export type { Locale } from './i18n/types';
