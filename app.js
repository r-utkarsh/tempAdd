const urlDomain = "https://api.mail.tm/domains";
const urlAccount = "https://api.mail.tm/accounts";
const urlToken = "https://api.mail.tm/token";
const urlMessages = "https://api.mail.tm/messages";
const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const nameLen = 13;

function createUsername(){
    let userName = "";
    for(let i=0; i<nameLen; i++){
        let randomIndex = Math.floor(Math.random() * chars.length);
        userName += chars[randomIndex];
    }
    return userName;
}

// gives the domain name from the api of mail.tm website
fetch(urlDomain)
    .then(res => res.json())
    .then(data => {
        const domain = data["hydra:member"][0].domain;
        const credentials = {
            address: `${createUsername()}@${domain}`.toLowerCase(),
            password: "123heghea"
        };
        console.log("Credentials:", credentials);

        // 1. Create the account
        return fetch(urlAccount, {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(credentials)
        })
        .then(res => res.json())
        .then(accountData => {
            // Guard: Check if account creation failed
            if (accountData.errors || !accountData.id) {
                throw new Error(`Account Creation Failed: ${JSON.stringify(accountData)}`);
            }
            console.log("Account created successfully!");
            
            // 2. Fetch the authentication token using credentials
            return fetch(urlToken, {
                method: "POST",
                headers: {
                    "content-type": "application/json"
                },
                body: JSON.stringify(credentials)
            })
            .then(res => res.json())
            .then(tokenData => {
                const token = tokenData.token;
                // Guard: Check if token is missing
                if (!token) {
                    throw new Error(`Token Retrieval Failed: ${JSON.stringify(tokenData)}`);
                }

                return fetch(urlMessages , {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                })
            })
        });
    })
    .then(res => res.json())
    .then(messages => {
        console.log("Messages List:");
        console.log(messages);
    })
    .catch(err => console.error("An error occurred:", err.message || err));
