import pandas as pd
import plotly.graph_objs as go
import plotly.offline as pyo

df = pd.read_csv('nst-est2017-alldata.csv')

df2 = df[df['DIVISION'] == '1']
df2.set_index('NAME', inplace=True) ##inplace 설정하지 않으면 원래 Dataframe의 index 사용하게된다.

list_of_pop_col = [col for col in df2.columns if col.startswith('POP')]
df2 = df2[list_of_pop_col]

data = [go.Scatter(x=df2.columns,
                    y=df2.loc[name],        ##.loc 은 actual value Return
                    mode='lines',
                    name=name) for name in df2.index]
pyo.plot(data)
