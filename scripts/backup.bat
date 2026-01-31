@echo off
REM ===========================================
REM Papyr.us PostgreSQL Backup Script (Windows)
REM ===========================================
REM Usage:
REM   backup.bat                  - Create backup
REM   backup.bat restore <file>   - Restore from backup
REM   backup.bat list             - List backups
REM ===========================================

setlocal EnableDelayedExpansion

REM Load .env if exists
if exist .env (
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        set "%%a=%%b"
    )
)

REM Configuration
if not defined BACKUP_DIR set BACKUP_DIR=.\backups
if not defined BACKUP_RETENTION_DAYS set BACKUP_RETENTION_DAYS=7
if not defined DATABASE_HOST set DATABASE_HOST=localhost
if not defined DATABASE_PORT set DATABASE_PORT=5432
if not defined POSTGRES_DB set POSTGRES_DB=papyrus_db
if not defined POSTGRES_USER set POSTGRES_USER=papyrus_user

for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (
    set DATESTAMP=%%c%%a%%b
)
for /f "tokens=1-2 delims=: " %%a in ('time /t') do (
    set TIMESTAMP=%%a%%b
)
set BACKUP_FILE=papyrus_backup_%DATESTAMP%_%TIMESTAMP%.sql

REM Ensure backup directory exists
if not exist %BACKUP_DIR% mkdir %BACKUP_DIR%

REM Parse arguments
if "%1"=="restore" goto :restore
if "%1"=="list" goto :list
goto :backup

:backup
echo [INFO] Starting PostgreSQL backup...
echo [INFO] Database: %POSTGRES_DB% @ %DATABASE_HOST%:%DATABASE_PORT%
echo [INFO] Backup file: %BACKUP_DIR%\%BACKUP_FILE%

set PGPASSWORD=%POSTGRES_PASSWORD%

pg_dump -h %DATABASE_HOST% -p %DATABASE_PORT% -U %POSTGRES_USER% -d %POSTGRES_DB% -f "%BACKUP_DIR%\%BACKUP_FILE%"

if errorlevel 1 (
    echo [ERROR] Backup failed!
    exit /b 1
)

echo [INFO] Backup completed successfully!

REM Compress if 7z is available
where 7z >nul 2>nul
if %errorlevel%==0 (
    7z a -tgzip "%BACKUP_DIR%\%BACKUP_FILE%.gz" "%BACKUP_DIR%\%BACKUP_FILE%"
    del "%BACKUP_DIR%\%BACKUP_FILE%"
    echo [INFO] Backup compressed!
)

goto :cleanup

:restore
if "%2"=="" (
    echo [ERROR] Usage: backup.bat restore ^<backup_file^>
    exit /b 1
)

set RESTORE_FILE=%2

if not exist "%RESTORE_FILE%" (
    echo [ERROR] Backup file not found: %RESTORE_FILE%
    exit /b 1
)

echo [WARNING] This will OVERWRITE the current database!
set /p CONFIRM="Are you sure? (yes/no): "

if not "%CONFIRM%"=="yes" (
    echo [INFO] Restore cancelled.
    exit /b 0
)

echo [INFO] Restoring from: %RESTORE_FILE%

set PGPASSWORD=%POSTGRES_PASSWORD%

psql -h %DATABASE_HOST% -p %DATABASE_PORT% -U %POSTGRES_USER% -d %POSTGRES_DB% -f "%RESTORE_FILE%"

echo [INFO] Restore completed!
goto :end

:list
echo [INFO] Available backups in %BACKUP_DIR%:
echo.
dir /b "%BACKUP_DIR%\papyrus_backup_*" 2>nul || echo No backups found.
echo.
goto :end

:cleanup
echo [INFO] Cleaning up old backups...
REM Delete files older than retention period
forfiles /p "%BACKUP_DIR%" /s /m papyrus_backup_* /d -%BACKUP_RETENTION_DAYS% /c "cmd /c del @path" 2>nul
echo [INFO] Cleanup completed!

:end
echo [INFO] Done!
endlocal
