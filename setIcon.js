import fs from 'fs/promises';
import * as ResEdit from 'resedit';
import path from 'path';

// Rangli log helper
const log = {
  success: (msg) => console.log('\x1b[32m%s\x1b[0m', msg),
  info: (msg) => console.log('\x1b[36m%s\x1b[0m', msg),
  error: (msg) => console.log('\x1b[31m%s\x1b[0m', msg),
};

async function setIcon() {
  try {
    // Fayl mavjudligini tekshirish
    await fs.access('mymouse.exe');
    await fs.access('icon.ico');

    log.info('Reading mymouse.exe...');
    const exeBuffer = await fs.readFile('mymouse.exe');

    log.info('Reading icon.ico...');
    const iconBuffer = await fs.readFile('icon.ico');

    log.info('Parsing executable...');
    const exe = ResEdit.NtExecutable.from(exeBuffer);
    const res = ResEdit.NtExecutableResource.from(exe);

    log.info('Parsing icon file...');
    const iconFile = ResEdit.Data.IconFile.from(iconBuffer);

    log.info('Replacing icons...');
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      1,      // Icon group ID
      1033,   // Language (US English)
      iconFile.icons.map((item) => item.data)
    );

    log.info('Generating new executable...');
    res.outputResource(exe);
    const newExe = Buffer.from(exe.generate());

    // Avtomatik yangi EXE nomi yaratish
    const newExeName = path.basename('mymouse.exe', '.exe') + '-icon.exe';
    await fs.writeFile(newExeName, newExe);

    log.success(`✓ Success! Icon and metadata have been set.`);
    log.success(`✓ New file: ${newExeName}`);
    log.success(`✓ Test the new exe to make sure it works!`);

  } catch (error) {
    log.error('✗ Error setting icon and metadata:');
    log.error(error.message);
    log.error('\nCheck the following:');
    log.error('1. mymouse.exe exists in the current folder');
    log.error('2. icon.ico exists and is a valid ICO file');
    log.error('3. resedit is installed: npm install resedit');
  }
}

setIcon();
