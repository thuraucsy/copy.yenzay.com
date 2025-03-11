import * as Ably from 'ably';
import { ChatClient, useMessages, usePresenceListener, usePresence } from '@ably/chat';
import { ChatClientProvider, ChatRoomProvider, RoomOptionsDefaults } from '@ably/chat';
import { useApp } from '../ThemedApp';
import { useState } from 'react';

let localConnection;
let sendChannel;
let remoteConnection;
let receiveChannel;

const RoomComponent = ({ client }) => {
    const [files, setFiles] = useState(null);

    const { roomStatus, roomError, send } = useMessages({
        listener: async (message) => {
            console.log('Received message: ', message);
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
                    }
                }
            }
            // {
            //         "type": "message.created",
            //         "message": {
            //             "serial": "01741680720256-000@a2dKYkKlgBmlN379316702:000",
            //             "clientId": "idd1e924dd6dd1f",
            //             "roomId": "main-room",
            //             "text": "Hello, World!",
            //             "metadata": { },
            //             "headers": { },
            //             "action": "message.create",
            //             "version": "01741680720256-000@a2dKYkKlgBmlN379316702:000",
            //             "createdAt": "2025-03-11T08:12:00.256Z",
            //             "timestamp": "2025-03-11T08:12:00.256Z"
            //        }
            // }
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
    }

    async function onReceiveChannelStateChange() {
        if (receiveChannel) {
            const readyState = receiveChannel.readyState;
            console.log(`Receive channel state is: ${readyState}`);
            // if (readyState === 'open') {
            //     timestampStart = (new Date()).getTime();
            //     timestampPrev = timestampStart;
            //     statsInterval = setInterval(displayStats, 500);
            //     await displayStats();
            // }
        }
    }

    return (
        <div>
            <p>Room status is: {roomStatus}</p>
            <p>Room error is: {roomError}</p>

            <FileComponent setFiles={setFiles} />
            <PresenceListener client={client} send={send} files={files} />
        </div>
    );
};

const PresenceListener = ({ client, send, files }) => {
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
            // if (!files || files?.length === 0) return;
            // console.log('files', files.length)
            createConnection(toClientId);
        };

        async function createConnection(toClientId) {
            // if (localConnection) {
            //     closeDataChannels();
            // }
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
            console.log('Created send data channel');

            sendChannel.addEventListener('open', onSendChannelStateChange);
            sendChannel.addEventListener('close', onSendChannelStateChange);
            sendChannel.addEventListener('error', onError);

            localConnection.addEventListener('icecandidate', async event => {
                console.log('Local ICE candidate: ', event.candidate);

                send({ text: 'candidate', metadata: { toClientId, data: event.candidate } });
            });

            function onError(error) {
                if (sendChannel) {
                    console.error('Error in sendChannel:', error);
                    return;
                }
                console.log('Error in sendChannel which is already closed:', error);
            }

            async function gotLocalDescription(desc) {
                await localConnection.setLocalDescription(desc);
                console.log(`Offer from localConnection\n ${desc.sdp}`);

                send({ text: 'description', metadata: { toClientId, data: desc } });
            }

            try {
                const offer = await localConnection.createOffer();
                await gotLocalDescription(offer);
            } catch (e) {
                console.log('Failed to create session description: ', e);
            }
        }

        function closeDataChannels() {
            console.log('Closing data channels');
            sendChannel.close();
            console.log(`Closed data channel with label: ${sendChannel.label}`);
            sendChannel = null;
            if (receiveChannel) {
                receiveChannel.close();
                console.log(`Closed data channel with label: ${receiveChannel.label}`);
                receiveChannel = null;
            }
            localConnection.close();
            remoteConnection.close();
            localConnection = null;
            remoteConnection = null;
            console.log('Closed peer connections');
        }

        function onSendChannelStateChange() {
            if (sendChannel) {
                const { readyState } = sendChannel;
                console.log('onSendChannelStateChange', readyState)
                console.log(`Send channel state is: ${readyState}`);
                if (readyState === 'open') {
                    // sendData();
                }
                // else if (readyState === 'closed') {
                // sendFileButton.disabled = true;
                // abortButton.disabled = true;
                // }
            }
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
    const updateFile = (event) => {

        const files = event.currentTarget.files;
        // ファイルがなければ終了
        if (!files || files?.length === 0) return;

        // 先頭のファイルを取得
        // const file = files[0];

        setFiles(files)

        console.log('updateFile', files)

    };

    return (
        <input type='file' onChange={updateFile} />
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
