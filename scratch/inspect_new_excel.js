import fs from 'fs';
import xlsx from 'xlsx';
import pg from 'pg';

const connectionString = "postgres://postgres:123456@localhost:5432/iskele_takip";
const pool = new pg.Pool({ connectionString });

async function analyzeNewExcel() {
  const filePath = 'c:\\Users\\msi-nb\\Desktop\\IskeleTakipElectron\\inventory_export9999999999.xlsx';
  
  if (!fs.existsSync(filePath)) {
    console.error('❌ File not found at:', filePath);
    process.exit(1);
  }
  
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: null });
  
  console.log(`Sheet name: ${sheetName}`);
  console.log(`Total rows read from Excel: ${rows.length}`);
  if (rows.length > 0) {
    console.log('Headers:', Object.keys(rows[0]));
  }
  
  // Connect to DB to check database-level clashes
  const client = await pool.connect();
  console.log('Database connection successful.');
  
  try {
    const dbItemsRes = await client.query('SELECT "ItemId", "ItemCode", "ItemName" FROM public."Inventories"');
    const dbItems = dbItemsRes.rows;
    console.log(`Total items in Database: ${dbItems.length}`);
    
    // Check duplicates inside Excel itself
    const excelCodes = new Map();
    const excelNames = new Map();
    
    console.log('\n--- Checking Excel Internal Duplicates ---');
    rows.forEach((row, index) => {
      const rowNum = index + 2; // 1-indexed header is Row 1
      const code = row['Stok Kodu'] ? String(row['Stok Kodu']).trim() : null;
      const name = row['Ürün Adı'] ? String(row['Ürün Adı']).trim() : null;
      
      if (code) {
        if (excelCodes.has(code)) {
          console.log(`⚠️ Excel Internal Duplicate Code: "${code}" at Row ${excelCodes.get(code)} and Row ${rowNum}`);
        } else {
          excelCodes.set(code, rowNum);
        }
      }
      
      if (name) {
        const lowerName = name.toLowerCase();
        if (excelNames.has(lowerName)) {
          console.log(`⚠️ Excel Internal Duplicate Name: "${name}" at Row ${excelNames.get(lowerName)} and Row ${rowNum}`);
        } else {
          excelNames.set(lowerName, rowNum);
        }
      }
    });
    
    console.log('\n--- Checking DB Clashes ---');
    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const code = row['Stok Kodu'] ? String(row['Stok Kodu']).trim() : null;
      const name = row['Ürün Adı'] ? String(row['Ürün Adı']).trim() : null;
      
      if (code) {
        // Find if this code exists in DB with a DIFFERENT name
        const clashingCode = dbItems.find(item => item.ItemCode === code && item.ItemName !== name);
        if (clashingCode) {
          console.log(`❌ Code Clash: Excel Row ${rowNum} has code "${code}" with name "${name}". But DB has this code with name "${clashingCode.ItemName}"!`);
        }
      }
      
      if (name) {
        // Find if this name exists in DB with a DIFFERENT code
        const clashingName = dbItems.find(item => item.ItemName && item.ItemName.toLowerCase() === name.toLowerCase() && item.ItemCode !== code);
        if (clashingName) {
          console.log(`❌ Name Clash: Excel Row ${rowNum} has name "${name}" with code "${code}". But DB has this name with code "${clashingName.ItemCode}"!`);
        }
      }
    });
    
  } catch (err) {
    console.error('Error during analysis:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

analyzeNewExcel();
