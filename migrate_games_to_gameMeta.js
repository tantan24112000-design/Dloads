/*
 ONE-TIME MIGRATION

 - Chạy trong môi trường admin/trusted có quyền ghi Firebase.
 - Đọc /games rồi tạo /gameMeta.
 - customHtml/customCss KHÔNG được copy vào gameMeta.
 - data:image/* (base64) bị bỏ khỏi meta để tránh làm metadata nặng.
*/

const dbUrl =
    'https://sf2g-bf285-default-rtdb.firebaseio.com';

const sourceUrl =
    `${dbUrl}/games.json`;

const targetUrl =
    `${dbUrl}/gameMeta.json`;

const META_FIELDS = [
    'name',
    'developer',
    'size',
    'category',
    'platforms',
    'price',
    'reviewText'
];

function isDataImage(value) {
    return (
        typeof value === 'string' &&
        value
            .trim()
            .startsWith('data:image/')
    );
}

async function migrate() {
    const readRes =
        await fetch(
            sourceUrl,
            {
                headers: {
                    Accept:
                        'application/json'
                }
            }
        );

    if (!readRes.ok) {
        throw new Error(
            `READ /games failed: HTTP ${readRes.status}`
        );
    }

    const games =
        await readRes.json() || {};

    const gameMeta = {};

    for (
        const [id, game]
        of Object.entries(games)
    ) {
        if (
            !game ||
            typeof game !== 'object'
        ) {
            continue;
        }

        const meta = {};

        for (
            const field
            of META_FIELDS
        ) {
            if (
                game[field] !== undefined &&
                game[field] !== null
            ) {
                meta[field] =
                    game[field];
            }
        }

        // Thumbnail/review image nên là URL ngoài Firebase.
        // Không đẩy base64 vào metadata.
        if (
            game.img &&
            !isDataImage(game.img)
        ) {
            meta.img =
                game.img;
        }

        if (
            game.reviewImg &&
            !isDataImage(game.reviewImg)
        ) {
            meta.reviewImg =
                game.reviewImg;
        }

        gameMeta[id] =
            meta;
    }

    const writeRes =
        await fetch(
            targetUrl,
            {
                method: 'PUT',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body:
                    JSON.stringify(
                        gameMeta
                    )
            }
        );

    if (!writeRes.ok) {
        throw new Error(
            `WRITE /gameMeta failed: HTTP ${writeRes.status}`
        );
    }

    console.log(
        `Done: ${Object.keys(gameMeta).length} games -> /gameMeta`
    );
}

migrate().catch(
    console.error
);
