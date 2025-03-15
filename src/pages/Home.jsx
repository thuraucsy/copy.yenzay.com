import * as Ably from 'ably';
import { ChatClient, useMessages, usePresenceListener, usePresence } from '@ably/chat';
import { ChatClientProvider, ChatRoomProvider, RoomOptionsDefaults } from '@ably/chat';
import { useApp } from '../ThemedApp';
import { useState } from 'react';
import { FileUploader } from 'react-drag-drop-files';

let localConnection;
let sendChannel;
let remoteConnection;
let receiveChannel;
let fileReader;
let receiveBuffer = [];
let receivedSize = 0;
let statsInterval = null;
let timestampStart;
let bitrateMax = 0;
let receiveFile;

const RoomComponent = ({ client }) => {
    const [files, setFiles] = useState(null);
    const [sendProgressMax, setSendProgressMax] = useState(0);
    const [sendProgressValue, setSendProgressValue] = useState(0);
    const [receiveProgressMax, setReceiveProgressMax] = useState(0);
    const [receiveProgressValue, setReceiveProgressValue] = useState(0);

    const [bitRateTextContent, setBitRateTextContent] = useState('');
    const [anchorHref, setAnchorHref] = useState(null);
    const [anchorFileName, setAnchorFileName] = useState('');
    const [anchorTextContent, setAnchorTextContent] = useState('');

    const { roomStatus, roomError, send } = useMessages({
        listener: async (message) => {
            console.log('Received message: ', message.message.text, message.message.metadata, message);
            if (message.message.clientId !== client.clientId) {
                console.log('getting message from another clientId', message.message.clientId)

                if (message.message.metadata.toClientId === client.clientId) { // sending to me
                    console.log(`${message.message.clientId} is sending to me`)

                    // receiving remote connection icecandidate, description
                    if (message.message.metadata.memo === 'not-to-create-remote-connection') {
                        if (message.message.text === 'description') {
                            await localConnection.setRemoteDescription(message.message.metadata.data);
                        } else if (message.message.text === 'icecandidate') {
                            await localConnection.addIceCandidate(message.message.metadata.data);
                        }

                        return;
                    }

                    // creating remote connection
                    if (!remoteConnection) {
                        remoteConnection = new RTCPeerConnection();
                        console.log('Created remote peer connection object remoteConnection');

                        remoteConnection.addEventListener('icecandidate', async event => {
                            console.log('Remote ICE candidate: ', event.candidate);
                            send({ text: 'icecandidate', metadata: { toClientId: message.message.clientId, data: event.candidate, memo: 'not-to-create-remote-connection' } });
                        });
                        remoteConnection.addEventListener('datachannel', receiveChannelCallback);
                    }

                    console.log('the log must not output from send channel')

                    if (message.message.text === 'icecandidate') {
                        await remoteConnection.addIceCandidate(message.message.metadata.data);
                    } else if (message.message.text === 'description') {
                        await remoteConnection.setRemoteDescription(message.message.metadata.data);
                        try {
                            const answer = await remoteConnection.createAnswer();
                            await gotRemoteDescription(answer, message.message.clientId);
                        } catch (e) {
                            console.log('Failed to create session description: ', e);
                        }
                    } else if (message.message.text === 'file') {
                        console.log('file', message)
                        receiveBuffer = [];
                        receivedSize = 0;
                        receiveFile = message.message.metadata.data;
                    }
                }
            }
        },
    });

    async function gotRemoteDescription(desc, toClientId) {
        await remoteConnection.setLocalDescription(desc);
        console.log(`Answer from remoteConnection\n ${desc.sdp}`);
        send({ text: 'description', metadata: { toClientId, data: desc, memo: 'not-to-create-remote-connection' } });
    }

    function receiveChannelCallback(event) {
        console.log('Receive Channel Callback');
        receiveChannel = event.channel;
        receiveChannel.binaryType = 'arraybuffer';
        receiveChannel.onmessage = onReceiveMessageCallback;
        receiveChannel.onopen = onReceiveChannelStateChange;
        receiveChannel.onclose = onReceiveChannelStateChange;

        // receivedSize = 0;
        // bitrateMax = 0;
        // downloadAnchor.textContent = '';
        // downloadAnchor.removeAttribute('download');
        // if (downloadAnchor.href) {
        //     URL.revokeObjectURL(downloadAnchor.href);
        //     downloadAnchor.removeAttribute('href');
        // }
    }

    function onReceiveMessageCallback(event) {
        // console.log(`Received Message ${event.data.byteLength} ${receivedSize}`);
        console.log(`Received Message ${event.data.byteLength}`);
        receiveBuffer.push(event.data);
        receivedSize += event.data.byteLength;
        setReceiveProgressValue(receivedSize);

        const file = receiveFile;
        if (receivedSize === file.size) {
            const received = new Blob(receiveBuffer);
            receiveBuffer = [];

            setAnchorHref(URL.createObjectURL(received));
            setAnchorFileName(file.name);
            setAnchorTextContent(`Click to download '${file.name}' (${file.size} bytes)`);

            const bitrate = Math.round(receivedSize * 8 / ((new Date()).getTime() - timestampStart));
            setBitRateTextContent(`Average Bitrate: ${bitrate} kbits/sec (max: ${bitrateMax} kbits/sec)`);

            if (statsInterval) {
                clearInterval(statsInterval);
                statsInterval = null;
            }

            closeDataChannels();
        }
    }

    async function onReceiveChannelStateChange() {
        if (receiveChannel) {
            const readyState = receiveChannel.readyState;
            console.log(`Receive channel state is: ${readyState}`);
            if (readyState === 'open') {
                timestampStart = (new Date()).getTime();
                timestampPrev = timestampStart;
                statsInterval = setInterval(displayStats, 500);
                await displayStats();
            }
        }
    }

    function closeDataChannels() {
        console.log('Closing data channels');
        if (receiveChannel) {
            receiveChannel.close();
            console.log(`Closed data channel with label: ${receiveChannel.label}`);
            receiveChannel = null;
        }
        remoteConnection.close();
        remoteConnection = null;
        console.log('Closed peer connections');
    }

    return (
        <div>
            <p>Room status is: {roomStatus}</p>
            <p>Room error is: {roomError}</p>

            <FileComponent setFiles={setFiles} />
            <PresenceListener client={client} send={send} files={files} setSendProgressMax={setSendProgressMax} setReceiveProgressMax={setReceiveProgressMax} />

            <div class="progress">
                <div class="label">Send progress: </div>
                <progress id="sendProgress" max={sendProgressMax} value={sendProgressValue}></progress>
            </div>

            <div class="progress">
                <div class="label">Receive progress: </div>
                <progress id="receiveProgress" max={receiveProgressMax} value={receiveProgressValue}></progress>
            </div>

            <div id="bitrate">{bitRateTextContent}</div>
            <a id-="download" href={anchorHref} download={anchorFileName}>{anchorTextContent}</a>
        </div>
    );
};

const PresenceListener = ({ client, send, files, setSendProgressMax, setReceiveProgressMax }) => {
    const { update, isPresent } = usePresence({
        enterWithData: { status: 'Online' },
    });

    try {
        const { presenceData, error } = usePresenceListener({
            listener: (event) => {
                console.log('PresenceListener event: ', event);
            },
        });

        const handleMessageSend = (toClientId) => {
            console.log('client send click', toClientId)
            if (!files || files?.length === 0) return;
            // console.log('files', files.length)
            createConnection(toClientId);
        };

        async function createConnection(toClientId) {
            console.log('send')

            localConnection = new RTCPeerConnection({
                iceServers: [
                    {
                        urls: "stun:stun.relay.metered.ca:80",
                    },
                    {
                        urls: "turn:global.relay.metered.ca:80",
                        username: "1eda77634afc4ceacdb160e8",
                        credential: "RMqmbmzBUz3QQcIX",
                    },
                    {
                        urls: "turn:global.relay.metered.ca:80?transport=tcp",
                        username: "1eda77634afc4ceacdb160e8",
                        credential: "RMqmbmzBUz3QQcIX",
                    },
                    {
                        urls: "turn:global.relay.metered.ca:443",
                        username: "1eda77634afc4ceacdb160e8",
                        credential: "RMqmbmzBUz3QQcIX",
                    },
                    {
                        urls: "turns:global.relay.metered.ca:443?transport=tcp",
                        username: "1eda77634afc4ceacdb160e8",
                        credential: "RMqmbmzBUz3QQcIX",
                    },
                ],
            });
            console.log('Created local peer connection object localConnection');

            sendChannel = localConnection.createDataChannel('sendDataChannel');
            sendChannel.binaryType = 'arraybuffer';
            console.log('Created send data channel', toClientId);

            sendChannel.addEventListener('open', function (e) { onSendChannelStateChange(e, toClientId) });
            sendChannel.addEventListener('close', function (e) { onSendChannelStateChange(e, toClientId) });
            sendChannel.addEventListener('error', onError);

            localConnection.addEventListener('icecandidate', async event => {
                console.log('Local ICE candidate: ', event.candidate);

                send({ text: 'icecandidate', metadata: { toClientId, data: event.candidate } });
            });

            try {
                const offer = await localConnection.createOffer();
                await gotLocalDescription(offer, toClientId);
            } catch (e) {
                console.log('Failed to create session description: ', e);
            }
        }

        function onError(error) {
            if (sendChannel) {
                console.error('Error in sendChannel:', error);
                return;
            }
            console.log('Error in sendChannel which is already closed:', error);
        }

        async function gotLocalDescription(desc, toClientId) {
            await localConnection.setLocalDescription(desc);
            console.log(`Offer from localConnection\n ${desc.sdp}`);

            send({ text: 'description', metadata: { toClientId, data: desc } });
        }

        function onSendChannelStateChange(event, toClientId) {
            console.log("onSendChannelStateChange toClientId", toClientId)
            if (sendChannel) {
                const { readyState } = sendChannel;
                console.log('onSendChannelStateChange', readyState)
                console.log(`Send channel state is: ${readyState}`);
                if (readyState === 'open') {
                    sendData(toClientId);
                }
                // else if (readyState === 'closed') {
                // sendFileButton.disabled = true;
                // abortButton.disabled = true;
                // }
            }
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function sendData(toClientId) {
            const file = files[0];
            console.log(`File is ${[file.name, file.size, file.type, file.lastModified].join(' ')}`);
            send({
                text: 'file', metadata: {
                    toClientId,
                    data: {
                        name: file.name,
                        size: file.size,
                    }
                }
            });

            await sleep(500);

            // Handle 0 size files.
            // statusMessage.textContent = '';
            // downloadAnchor.textContent = '';
            if (file.size === 0) {
                bitrateDiv.innerHTML = '';
                statusMessage.textContent = 'File is empty, please select a non-empty file';
                // closeDataChannels();
                return;
            }
            setSendProgressMax(file.size);
            setReceiveProgressMax(file.size);
            const chunkSize = 16384;
            fileReader = new FileReader();
            let offset = 0;
            fileReader.addEventListener('error', error => console.error('Error reading file:', error));
            fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
            fileReader.addEventListener('load', e => {
                console.log('FileRead.onload  ', e);


                const send = () => {
                    while (e.target.result && e.target.result.byteLength) {
                        if (sendChannel.bufferedAmount > sendChannel.bufferedAmountLowThreshold) {
                            sendChannel.onbufferedamountlow = () => {
                                sendChannel.onbufferedamountlow = null;
                                send();
                            };
                            return;
                        }
                        //     const chunk = buffer.slice(0, chunkSize);
                        //     buffer = buffer.slice(chunkSize, buffer.byteLength);
                        //     dataChannel.send(chunk);
                        sendChannel.send(e.target.result);

                        offset += e.target.result.byteLength;
                        sendProgress.value = offset;
                        if (offset < file.size) {
                            readSlice(offset);
                        }
                    }
                };
                send();




            });
            const readSlice = o => {
                // console.log('readSlice ', o);
                const slice = file.slice(offset, o + chunkSize);
                fileReader.readAsArrayBuffer(slice);
            };
            readSlice(0);
        }

        return (
            <div>
                <p>Presence data:</p>
                {error === undefined ? (
                    <ul>
                        {presenceData.filter(x => x.clientId !== client.clientId).map((presence) => (
                            <li key={presence.clientId} onClick={() => {
                                handleMessageSend(presence.clientId);
                            }}>{presence.clientId} {presence.data.status}</li>
                        ))}
                    </ul>
                ) : (
                    <p>Error loading presence data</p>
                )}
            </div>
        );
    } catch (err) {
        // client id same err, we will reload the page and get the diff id again
        location.reload();
    }
};

const FileComponent = ({ setFiles }) => {
    const updateFile = (files) => {

        // ファイルがなければ終了
        if (!files || files?.length === 0) return;

        // 先頭のファイルを取得
        // const file = files[0];

        setFiles(files)

        console.log('updateFile', files)

    };

    return (
        <FileUploader name="file" handleChange={updateFile} multiple />
    );
}


const Home = () => {
    const { clientId, setClientId } = useApp();

    const ablyCredential = import.meta.env.VITE_ABLY_API_KEY_CREDENTIAL;

    const realtimeClient = new Ably.Realtime({
        "key": ablyCredential,
        "clientId": clientId
    });
    const chatClient = new ChatClient(realtimeClient);

    return (
        <ChatClientProvider client={chatClient}>
            <ChatRoomProvider
                id="main-room"
                options={RoomOptionsDefaults}
            >
                <RoomComponent client={chatClient} />
            </ChatRoomProvider>
        </ChatClientProvider>
    );
};


export default Home
