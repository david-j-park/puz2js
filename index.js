// Copyright (C) 2021, David J. Park
// 
// Based on Jim Horne's AcrossLiteToText (https://github.com/jahorne/AcrossLiteToText)
// Reads a binary .puz file and returns a javascript object with its title,
// author, copyright, notepad, and full clue/answer list

let IsLocked;   // true if the Across Lite puzzle is locked
let title
    , author
    , copyright
    , rowcount
    , colcount
    , grid
    , isRebus
    , crackedRebusCode;
const BLOCK = '.';
const hasCircle = []; //squares with circles in them?
const rebusKeys = [];

function GetRebusKey(nValue){
    return nValue < 10 ? String.fromCharCode(nValue) : String.fromCharCode(nValue + 'a'.charCodeAt() - 10); 
}

const CircleMarker = "GEXT";
const RebusMarker = "GRBS";
const ManualRebusMarker = "RUSR";

//main function; receives byte array of input
function Puzzle(b){

    /* basic output shape */
    let puzzle = {
        title: '',
        author: '',
        copyright: '',
        clues: [],
        notepad: ''
    }

    const columnsOffset = 0x2c; // number of columns is at this offset in Across Lite file
    const rowsOffset = 0x2d;    // number of rows is in next byte
    const gridOffset = 0x34;    // standard location to start parsing grid data in binary stream

    IsLocked = b[0x32] != 0 || b[0x33] != 0; // is Across Lite file encrypted?
    colcount = b[columnsOffset];
    rowcount = b[rowsOffset];
    const gridsize = colcount * rowcount;

    grid = [];
    gridNumbers = [];

    let i = gridOffset;

    // If the next byte is NOT either a empty square or a filled in square indicator,
    // the puzzle has been fixed up, either to include Subs in older puzzles or to show solved but
    // still encrypted puzzles.
    //
    // 0x2E means black square (block) and 0x2D is empty square.
    // Note 0x2E is valid in both sections so find first non black square and check if it's a blank.

    let answerOffset = gridOffset + gridsize;
    let nOff = answerOffset;
    let isManuallySolved = false;      // assume we're working with the published solution

    // go to first non-black square

    while (b[nOff] == 0x2E || b[nOff] == 0x3A)
        nOff++;

    // if it's not a space character, we mark the puzzle as manually solved and
    // move i to the start of the hand-entered solution

    if (b[nOff] != 0x2D)
    {
        isManuallySolved = true;
        i = answerOffset;
    }

    // i now points to start of grid with unencrypted solution,
    // so we can fill the _grid array with answer letters in each square.

    for (let r = 0; r < rowcount; r++)
    {
        grid[r] = [];
        for (let c = 0; c < colcount; c++){
            let cLetter = String.fromCharCode(b[i++]);
            if (cLetter == ':'){
                grid[r][c] = BLOCK;
            }
            else grid[r][c] = cLetter;
        }
    }

    let num = 1;

    //number the grid
    for (let r = 0; r < rowcount; r++){
        gridNumbers[r] = [];
        for (let c = 0; c < colcount; c++){
            if (grid[r][c] != BLOCK){
                if ((c == 0 || grid[r][c - 1] == BLOCK) && c != colcount -1 && grid[r][c + 1] != BLOCK){
                    gridNumbers[r][c] = num++;
                }

                else if ((r == 0 || grid[r - 1][c] == BLOCK) && r != rowcount - 1 && grid[r + 1][c] != BLOCK){
                    gridNumbers[r][c] = num++;
                }

            }
        }
    }

    i = gridOffset + (2 * gridsize);

    //gets one line at a go
    function NextString(){
        let start = i, buf = [];
        while (b[i] != 0){
            buf.push(b[i]);
            i++;
        }
        i++;
        return str = Buffer.from(buf).toString('latin1');
    }

    title = NextString();
    author = NextString();
    copyright = NextString();

    
    //parse rebus
    isRebus = ParseRebus(b, i);
    
    //do the clues
    for (let r = 0; r < rowcount; r++){
        for (let c = 0; c < colcount; c++){
            if (!gridNumbers[r][c]) continue;
            if ((c == 0 || grid[r][c - 1] == BLOCK) && c != colcount - 1 && grid[r, c + 1] != BLOCK){
                let clue = NextString();
                let answer = GetAcrossAnswer(r, c);
                puzzle.clues.push({
                    number: gridNumbers[r][c],
                    direction: 'Across',
                    clue: clue,
                    answer: answer
                });
            }

            if ((r == 0 || grid[r-1][c] == BLOCK) && r != rowcount - 1 && grid[r+1][c] != BLOCK){
                let clue = NextString();
                let answer = GetDownAnswer(r, c);
                puzzle.clues.push({
                    number: gridNumbers[r][c],
                    direction: 'Down',
                    clue: clue,
                    answer: answer
                });
            }
        }        
    }
    puzzle.author = author;
    puzzle.title = title;
    puzzle.copyright = copyright;
    puzzle.notepad = NextString();

    return puzzle;

}

function FindMarker(b, marker, index)
{
    let bFound = false;    // default assumption

    while (index < b.Count - (rowcount * colcount))
    {
        if (b[index] == marker[0] && b[index + 1] == marker[1] && b[index + 2] == marker[2] && b[index + 3] == marker[3])
        {
            bFound = true;
            break;
        }

        index++;
    }

    if (bFound)
        index += 8;         // actual data starts here

    return bFound;
}

function ParseCircles(b, i){
    let found = FindMarker(b, CircleMarker, i);

    if (found)              // if marker found (might be bogus)
    {
        found = false;      // reset

        hasCircle = [];    // array to store circle data

        for (let row = 0; row < rowcount; row++)
        {
            hasCircle[row] = [];
            for (let col = 0; col < colcount; col++, i++)
            {
                // 0x80 means circle, 0xC0 means circle in diagramless

                if (b[n] == 0x80 || b[n] == 0xC0)
                {
                    hasCircle[row][col] = true;
                    found = true;
                }
            }
        }
    }

    return found
}

function ParseRebus(b, index)
{
    let found = FindMarker(b, RebusMarker, index);     // look for "GRBS"

    if (found)
    {
        found = false;      // reset and look for real data

        rebusKeys = [];         // location of rebus squares

        for (let row = 0; row < rowcount; row++)
        {
            rebusKeys[row] = [];
            for (let col = 0; col < colcount; col++)
            {
                let rebusKey = b[index++];

                rebusKeys[row][col] = rebusKey;

                if (rebusKey > 0)
                    found = true;
            }
        }

        // If actual rebus data found, parse it and return true

        if (found)
        {
            index += 9;     // skip to start of substring table

            let rebusString = '';
            let tmp = [];

            while (b[index] != 0){
                tmp.push(b[index]);
            }
            rebusString = Buffer.from(tmp).toString('latin1');

            crackedRebusCode = CrackRebusCode(rebusString);
        }
    }

    return found;
}

function CrackRebusCode(str)
{
    let dict = {};

    str.split(';').forEach(rebusData => {
        if (!string.IsNullOrWhiteSpace(rebusData))
        {
            let rebusParts = rebusData.split(':');
            let nKey = parseInt(rebusParts[0]);
            dict[nKey + 1] = rebusParts[1];              // Key is number before colon plus + 1
        }
    })

    return dict;
}

function GetAcrossAnswer(row, col){
    let answer = '';

    while (col < colcount && grid[row][col] != BLOCK)
    {
        if (isRebus && rebusKeys[row][col] > 0)
            answer += crackedRebusCode[rebusKeys[row][col]];
        else
            answer += grid[row][col];

        col++;
    }

    return answer;
}

function GetDownAnswer(row, col){
    let answer = '';

    while (row < rowcount && grid[row][col] != BLOCK)
    {
        if (isRebus && rebusKeys[row][col] > 0)
            answer += crackedRebusCode[rebusKeys[row][col]];
        else
            answer += grid[row][col];

        row++;
    }

    return answer;
}

module.exports = Puzzle;