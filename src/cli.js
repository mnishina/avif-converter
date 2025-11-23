import inquirer from 'inquirer';
import chalk from 'chalk';
import { MultiBar, Presets } from 'cli-progress';
import { formatBytes } from './utils.js';

export async function askQuestions() {
    const questions = [
        {
            type: 'input',
            name: 'input',
            message: '入力フォルダのパス:',
            default: './input',
            validate: (input) => input.length > 0 || 'パスを入力してください'
        },
        {
            type: 'input',
            name: 'output',
            message: '出力フォルダのパス:',
            default: './output',
            validate: (input) => input.length > 0 || 'パスを入力してください'
        },
        {
            type: 'number',
            name: 'quality',
            message: '画質 (0-100):',
            default: 80,
            validate: (input) => (input >= 0 && input <= 100) || '0から100の間で入力してください'
        }
    ];

    return inquirer.prompt(questions);
}

export async function confirmProcessing(count) {
    const { confirm } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            message: `${count}枚の画像を変換します。よろしいですか？`,
            default: true
        }
    ]);
    return confirm;
}

export function createProgressBar() {
    return new MultiBar({
        clearOnComplete: false,
        hideCursor: true,
        format: ' {bar} | {percentage}% | {value}/{total} | {filename} ({sizeInfo})',
    }, Presets.shades_classic);
}

export function printSummary(results, duration) {
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    const totalOriginalSize = results.reduce((acc, r) => acc + (r.originalSize || 0), 0);
    const totalAvifSize = results.reduce((acc, r) => acc + (r.avif?.size || 0), 0);
    const totalFallbackSize = results.reduce((acc, r) => acc + (r.fallback?.size || 0), 0);

    const avifReduction = totalOriginalSize > 0
        ? Math.round((1 - totalAvifSize / totalOriginalSize) * 100)
        : 0;

    const fallbackReduction = totalOriginalSize > 0
        ? Math.round((1 - totalFallbackSize / totalOriginalSize) * 100)
        : 0;

    console.log('\n');
    if (failCount === 0) {
        console.log(chalk.green('✓ 完了！'));
    } else {
        console.log(chalk.yellow(`⚠ 完了（${failCount}件のエラーあり）`));
    }

    console.log(`  処理時間: ${(duration / 1000).toFixed(1)}秒`);
    console.log(`  元のサイズ: ${formatBytes(totalOriginalSize)}`);
    console.log(`  AVIF変換後: ${formatBytes(totalAvifSize)} (${avifReduction}% 削減)`);
    console.log(`  圧縮版生成: ${formatBytes(totalFallbackSize)} (${fallbackReduction}% 削減)`);
    console.log('\n');

    if (failCount > 0) {
        console.log(chalk.red('エラー一覧:'));
        results.filter(r => !r.success).forEach(r => {
            console.log(`  ❌ ${r.inputPath}: ${r.error}`);
        });
    }
}
