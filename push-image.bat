@echo off
setlocal enabledelayedexpansion

rem Push a locally built prep-room image to the SDP registry:
rem   registry.cn.ndhy.com/<appId>/maolab-prep-<service>:<version>
rem The tag doubles as the SDP version-name: letters, digits and "." only, max 20 chars.
rem Build first: docker compose build prep-web / prep-api / prep-harness / render
rem Log in first: docker login registry.cn.ndhy.com


if "%~2"=="" (
    echo Usage: %~nx0 SERVICE VERSION - SERVICE is web, api, harness or render
    echo Example: %~nx0 api 0.1.0
    exit /b 1
)

set "SERVICE=%~1"
set "VERSION=%~2"
set "LOCAL_IMAGE="
if "%SERVICE%"=="web" set "LOCAL_IMAGE=maolab-prep:web"
if "%SERVICE%"=="api" set "LOCAL_IMAGE=maolab-prep:api"
if "%SERVICE%"=="harness" set "LOCAL_IMAGE=maolab-prep:harness"
if "%SERVICE%"=="render" set "LOCAL_IMAGE=maolab-prep:render"
if not defined LOCAL_IMAGE (
    echo Unknown service "%SERVICE%": use web, api, harness or render.
    exit /b 1
)
echo %VERSION%| findstr /r /x "[A-Za-z0-9.]*" >nul
if errorlevel 1 (
    echo Invalid version "%VERSION%": only letters, digits and "." allowed.
    exit /b 1
)
if not "%VERSION:~20%"=="" (
    echo Invalid version "%VERSION%": max 20 characters.
    exit /b 1
)

set "APP_ID=6ad6e04df7648248cac692cc"
set "IMAGE_NAME=maolab-prep-%SERVICE%"
set "REMOTE_IMAGE=registry.cn.ndhy.com/%APP_ID%/%IMAGE_NAME%:%VERSION%"

echo Local image : %LOCAL_IMAGE%
echo Remote image: %REMOTE_IMAGE%

docker tag %LOCAL_IMAGE% %REMOTE_IMAGE%
if errorlevel 1 (
    echo Tag failed.
    exit /b 1
)
docker push %REMOTE_IMAGE%
if errorlevel 1 (
    echo Push failed. Did you run: docker login registry.cn.ndhy.com ?
    exit /b 1
)

echo Done: %REMOTE_IMAGE%
echo Next: sdp-portal-cli build custom-image %APP_ID% --version-name %VERSION% --env-type 8 --env-id 6ad6e04ff7648248cac692d1 --image-name %IMAGE_NAME% --tag %VERSION% --yes --wait
exit /b 0
