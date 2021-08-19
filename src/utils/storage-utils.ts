import * as fs from 'fs';
import { EOL } from 'os';

/**
 * Keep only valid lines for storage
 *
 * @param string[] rows The candidate lines to store
 * @return string[]
 */
export function cleanCsvStorage(rows: string[]): string[] {
  return rows.filter((row) => row?.trim()?.length ?? 0 > 0);
}

/**
 * Get the lines as stored in CSV
 *
 * @param pathToFile The path to the CSV file
 * @return Generator<string>
 */
export function* getCsvFileLinesAsIterable(pathToFile: string): Generator<string> {
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(pathToFile, 'utf8');
  } catch (error) {
    console.log('Error reading header from file', pathToFile, error);
    return;
  }

  for (const line of cleanCsvStorage(fileContent.split(EOL))) {
    yield line;
  }
}

/**
 * Get the lines as stored in CSV
 *
 * @param pathToFile The path to the CSV file
 * @return string[]
 */
export function getCsvFileLinesAsArray(pathToFile: string): string[] {
  return Array.from(getCsvFileLinesAsIterable(pathToFile));
}
/**
 * Get the CSV file header (first line)
 *
 * @param pathToFile The actual file path
 */
export const getCsvFileHeader = (pathToFile: string): string => {
  return getCsvFileLinesAsIterable(pathToFile).next().value || '';
};

/**
 * Store the comments
 *
 * @param pathToFile The path to the file to write
 * @param rows The lines to store
 * @param overwrite Replace all (true) / append (false)
 * @return true if the operation was successful, false otherwise
 */
export function setCsvFileLines(pathToFile: string, rows: string[], overwrite: boolean = true): boolean {
  // The last line of the file must always be terminated with an EOL
  const content = cleanCsvStorage(rows).join(EOL) + EOL;
  try {
    if (overwrite) {
      fs.writeFileSync(pathToFile, content);
    } else {
      fs.appendFileSync(pathToFile, content);
    }
    return true;
  } catch (error) {
    console.log('Error writing content of file', pathToFile, error);
    return false;
  }
}

/**
 * Write the content of the CSV file
 *
 * @param pathToFile The path to the file to write
 * @param fileContent The content of the file
 * @return boolean true if the operation was successful, false otherwise
 */
export function setCsvFileContent(pathToFile: string, fileContent: string): boolean {
  try {
    fs.writeFileSync(pathToFile, fileContent, 'utf8');
    return true;
  } catch (error) {
    console.log('Error writing content of file', pathToFile, error);
    return false;
  }
}
