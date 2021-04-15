# puz2js
Converts binary Across Lite (.puz) files to javascript objects listing title, author, copyright, notepad, and clues/answers.

Based on Jim Horne's excellent [AcrossLiteToText](https://github.com/jahorne/AcrossLiteToText) library. All credit goes to Jim for the parsing logic. Check out his [XWordInfo](https://www.xwordinfo.com/) site for tons of great crosswording resources!

Basic usage:
```javascript
const puz2js = require('puz2js')
, fs = require('fs');

const puzzleBytes = fs.readFileSync('/path/to/.puz file');

const parsedPuzzle = puz2js(puzzleBytes);

/* get across clues */
const across = parsedPuzzle.clues.filter((v, i) => {
    return v.direction = 'Across'
});
```
## Guidelines for Usage
__Please respect the copyrights of puzzle constructors when using this tool__. Anything other than personal use of their work requires permission.
