import { glob } from 'glob';
import fs from 'fs/promises';
import path from 'path';

/**
 * 指定されたパターンに一致する画像ファイルを検索します
 * @param {string} directory 検索対象ディレクトリ
 * @param {string} pattern globパターン
 * @returns {Promise<string[]>} ファイルパスの配列
 */
export async function findImages(directory, pattern = '*.{png,jpg,jpeg,webp}') {
    // globのパターンはスラッシュ区切りである必要があるため、Windowsパスを考慮して置換などはglob内部で処理されるが、
    // 結合時は注意が必要。
    // glob v10以降はposix pathを要求することが多い。

    // ディレクトリパスを正規化
    // 再帰的に検索するために ** を付与
    const searchPattern = path.posix.join(directory.split(path.sep).join('/'), '**', pattern);

    // globを実行
    // ignore: node_modulesなどは除外したい
    const files = await glob(searchPattern, {
        ignore: '**/node_modules/**',
        nodir: true,
        absolute: true
    });

    return files;
}

/**
 * ディレクトリが存在するか確認し、なければ作成するかエラーを返す
 * @param {string} dirPath 
 * @param {boolean} createIfMissing 
 */
export async function ensureDirectory(dirPath, createIfMissing = true) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        if (createIfMissing) {
            await fs.mkdir(dirPath, { recursive: true });
        } else {
            throw new Error(`Directory not found: ${dirPath}`);
        }
    }
}

/**
 * ディレクトリの中身を空にする（ディレクトリ自体は残すか再作成する）
 * @param {string} dirPath 
 */
export async function cleanDirectory(dirPath) {
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        throw new Error(`Failed to clean directory: ${dirPath}. ${error.message}`);
    }
}

/**
 * ファイルサイズを人間が読みやすい形式に変換
 * @param {number} bytes 
 * @returns {string}
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
