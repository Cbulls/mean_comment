const axios = require('axios');

exports.handler = async (event, context) => {
  // CORS 헤더 설정
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // POST 요청만 허용
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const apiUrl =
      'https://clovastudio.stream.ntruss.com/testapp/v3/chat-completions/HCX-005';
    const clovaStudioApiKey = process.env.API_KEY;

    if (!clovaStudioApiKey) {
      throw new Error('API 키가 설정되지 않았습니다.');
    }

    const requestBody = JSON.parse(event.body);

    console.log('API 호출 시작:', apiUrl);
    const response = await axios.post(apiUrl, requestBody, {
      headers: {
        Authorization: `Bearer ${clovaStudioApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      responseType: 'stream',
    });

    console.log('API 응답 상태 코드:', response.status);

    return new Promise((resolve) => {
      let fullData = '';
      let resultData = null;
      let isResultEvent = false;

      response.data.on('data', (chunk) => {
        fullData += chunk.toString();
        const lines = chunk.toString().split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          if (line.trim() === 'event:result') {
            isResultEvent = true;
            continue;
          }

          if (isResultEvent && line.startsWith('data:')) {
            try {
              const jsonStr = line.replace('data:', '').trim();
              const parsedData = JSON.parse(jsonStr);

              if (parsedData.message && parsedData.message.content) {
                resultData = parsedData;
                isResultEvent = false;
              }
            } catch (error) {
              console.error('JSON 파싱 오류:', error.message);
            }
          }
        }
      });

      response.data.on('end', () => {
        if (resultData) {
          resolve({
            statusCode: 200,
            headers,
            body: JSON.stringify(resultData),
          });
        } else {
          resolve({
            statusCode: 500,
            headers,
            body: JSON.stringify({
              error: '최종 결과를 추출할 수 없습니다.',
              rawData: fullData.substring(0, 1000),
            }),
          });
        }
      });

      response.data.on('error', (error) => {
        console.error('스트리밍 응답 오류:', error.message);
        resolve({
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: '스트리밍 응답 처리 중 오류 발생',
            details: error.message,
          }),
        });
      });
    });
  } catch (error) {
    console.error('API 호출 오류:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        details: error.response?.data || 'No additional details available',
      }),
    };
  }
};
