import * as vscode from 'vscode';
import { SpecPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    // Файл активной вкладки намеренно НЕ подставляем, хотя VSCode и передаёт сюда его uri:
    // панель всегда открывается с последним успешно загруженным источником.
    // Открыть соседний файл — почти всегда не то, что нужно, а прежний источник
    // при этом молча затирался бы. Нужный файл выбирается в самой панели.
    vscode.commands.registerCommand('openapiParser.open', () => {
      SpecPanel.show(context);
    }),

    // View в Activity Bar намеренно пустой: он нужен только как место для кнопки
    // из viewsWelcome. Приветственный текст показывается, лишь пока дерево пусто,
    // поэтому провайдер всегда возвращает пустой список.
    vscode.window.registerTreeDataProvider('openapiParser.launch', {
      getChildren: () => [],
      getTreeItem: (item: vscode.TreeItem) => item,
    }),
  );
}

export function deactivate() {
  // панель освобождает свои ресурсы сама, через onDidDispose
}
