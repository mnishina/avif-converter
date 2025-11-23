#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { findImages, ensureDirectory, cleanDirectory, formatBytes } from './utils.js';
import { convertImage } from './converter.js';
import { askQuestions, confirmProcessing, createProgressBar, printSummary } from './cli.js';

const program = new Command();

program
    .name('avif-converter')
    .description('PNG/JPEG画像をAVIF形式に一括変換するCLIツール')
    .version('1.0.0')
    .option('-i, --input <path>', '入力フォルダのパス')
    .option('-o, --output <path>', '出力フォルダのパス')
    .option('-q, --quality <number>', '画質 (0-100)', parseInt)
    .option('-e, --effort <number>', 'エンコード品質 (0-9)', parseInt)
    .option('-r, --resize <value>', 'リサイズ (例: 50%, 1920)')
    .option('-p, --pattern <glob>', 'ファイルパターン', '*.{png,jpg,jpeg,webp}')
    .option('-y, --yes', '確認プロンプトをスキップ', false)
    .option('-s, --silent', '進捗表示を最小化', false);

program.parse(process.argv);

async function main() {
    const options = program.opts();

    // 引数が指定されているかチェック
    // input, output, qualityのいずれかが指定されていれば引数モードとみなす
    // あるいは、明示的にデフォルト値で実行したい場合もあるかもしれないが、
    // ここでは主要なオプションが未指定の場合にインタラクティブモードとする
    const isInteractive = !options.input && !options.output;

    let config = {
        input: options.input || './input',
        output: options.output || './output',
        quality: options.quality || 80,
        effort: options.effort || 4,
        pattern: options.pattern || '*.{png,jpg,jpeg,webp}',
        yes: options.yes || false,
        silent: options.silent || false,
        resize: options.resize
    };

    if (isInteractive) {
        console.log(chalk.cyan('AVIF画像変換ツール - インタラクティブモード'));
        const answers = await askQuestions();
        config = { ...config, ...answers };
    }

    // 入力パスの解決
    const inputPath = path.resolve(process.cwd(), config.input);
    const outputPath = path.resolve(process.cwd(), config.output);

    // 画像ファイルの検索
    try {
        await ensureDirectory(inputPath, false);
    } catch (e) {
        console.error(chalk.red(`❌ エラー: 入力フォルダが見つかりません\n   パス: ${inputPath}`));
        process.exit(1);
    }

    if (!config.silent) {
        console.log(`\n📁 画像を検索中... (${inputPath})`);
    }

    const files = await findImages(inputPath, config.pattern);

    if (files.length === 0) {
        console.log(chalk.yellow('画像ファイルが見つかりませんでした。'));
        process.exit(0);
    }

    if (!config.silent) {
        console.log(`📁 ${files.length}枚の画像を検出しました`);
    }

    // 確認プロンプト
    if (!config.yes && isInteractive) {
        const confirmed = await confirmProcessing(files.length);
        if (!confirmed) {
            console.log('キャンセルしました。');
            process.exit(0);
        }
    }

    // 出力ディレクトリのリセットと準備
    if (!config.silent) {
        console.log(`\n🧹 出力フォルダをリセット中... (${outputPath})`);
    }
    try {
        await cleanDirectory(outputPath);
    } catch (e) {
        // ディレクトリが存在しない場合は無視して作成に進む
        // cleanDirectory内部でrmが失敗する（存在しない場合など）可能性を考慮
        // ただしutils.jsの実装ではrm force:trueなのでエラーにならないはずだが、
        // 権限エラーなどはキャッチする必要がある
        if (e.code !== 'ENOENT') {
            // 権限エラーなどで消せない場合は警告を出して続行するか、終了するか。
            // ここでは一旦警告を出して続行（上書きモードになる）
            console.warn(chalk.yellow(`⚠️  出力フォルダのリセットに失敗しました: ${e.message}`));
        }
    }
    await ensureDirectory(outputPath, true);

    if (!config.silent) {
        console.log('\n変換中...');
    }

    // プログレスバーの準備
    const multibar = config.silent ? null : createProgressBar();
    const bar = multibar ? multibar.create(files.length, 0, { filename: '準備中...', sizeInfo: '' }) : null;

    const startTime = Date.now();
    const concurrency = os.cpus().length;
    const results = [];
    const executing = [];

    for (const file of files) {
        const task = async () => {
            const result = await convertImage(file, inputPath, outputPath, config);
            if (bar) {
                bar.increment(1, {
                    filename: path.basename(result.inputPath),
                    sizeInfo: result.success ? `${formatBytes(result.originalSize)} → ${formatBytes(result.avif.size)}` : 'Error'
                });
            }
            return result;
        };

        const p = task().then(res => {
            results.push(res);
            executing.splice(executing.indexOf(p), 1);
        });

        executing.push(p);

        if (executing.length >= concurrency) {
            await Promise.race(executing);
        }
    }

    await Promise.all(executing);

    if (multibar) {
        multibar.stop();
    }

    const endTime = Date.now();
    printSummary(results, endTime - startTime);
}

main().catch(err => {
    console.error(chalk.red('予期せぬエラーが発生しました:'), err);
    process.exit(1);
});
