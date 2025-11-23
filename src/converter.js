import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { ensureDirectory } from './utils.js';

/**
 * 単一の画像をAVIFに変換します
 * @param {string} filePath 入力ファイルの絶対パス
 * @param {string} inputRoot 入力ルートディレクトリ
 * @param {string} outputRoot 出力ルートディレクトリ
 * @param {object} options 変換オプション (quality, effortなど)
 * @returns {Promise<object>} 変換結果情報
 */
export async function convertImage(filePath, inputRoot, outputRoot, options) {
    try {
        // 相対パスを計算して出力パスを生成
        // inputRootが filePath の先頭に含まれていることを前提とする
        // inputRoot: /path/to/input
        // filePath: /path/to/input/subdir/image.png
        // relative: subdir/image.png

        // inputRootとfilePathのパス区切り文字を統一してから相対パスを取得
        const relativePath = path.relative(inputRoot, filePath);
        const outputDir = path.dirname(path.join(outputRoot, relativePath));
        const fileName = path.basename(filePath, path.extname(filePath));
        const outputFilePath = path.join(outputDir, `${fileName}.avif`);

        // 出力ディレクトリの作成
        await ensureDirectory(outputDir);

        // ファイル情報の取得
        const stats = await fs.stat(filePath);
        const originalSize = stats.size;

        const start = Date.now();

        const image = sharp(filePath);
        const metadata = await image.metadata();
        const format = metadata.format;

        // AVIF変換
        await image
            .clone()
            .avif({
                quality: options.quality,
                effort: options.effort,
                chromaSubsampling: '4:4:4'
            })
            .toFile(outputFilePath);

        const avifStats = await fs.stat(outputFilePath);

        // フォールバック画像の生成（同形式圧縮）
        const fallbackFileName = path.basename(filePath);
        const fallbackFilePath = path.join(outputDir, fallbackFileName);

        let fallbackPipeline = image.clone();

        if (format === 'jpeg' || format === 'jpg') {
            fallbackPipeline = fallbackPipeline.jpeg({ quality: options.quality, mozjpeg: true });
        } else if (format === 'png') {
            // PNGの圧縮: qualityを指定してパレット化するか、圧縮レベルを調整
            // ここではquality指定がある場合はpalette: trueで減色処理を行う
            fallbackPipeline = fallbackPipeline.png({
                quality: options.quality,
                palette: true,
                compressionLevel: 9
            });
        } else if (format === 'webp') {
            fallbackPipeline = fallbackPipeline.webp({ quality: options.quality });
        }
        // その他の形式はそのままコピーに近い形で出力される可能性があるが、
        // 基本的にPNG/JPEG/WebPが対象

        await fallbackPipeline.toFile(fallbackFilePath);
        const fallbackStats = await fs.stat(fallbackFilePath);

        const end = Date.now();

        return {
            success: true,
            inputPath: filePath,
            avif: {
                path: outputFilePath,
                size: avifStats.size
            },
            fallback: {
                path: fallbackFilePath,
                size: fallbackStats.size,
                format: format
            },
            originalSize,
            duration: end - start
        };

    } catch (error) {
        return {
            success: false,
            inputPath: filePath,
            error: error.message
        };
    }
}
